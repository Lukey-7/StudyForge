"""RAG chat: rewrite -> retrieve -> grounded prompt -> stream tokens -> save with citations.

Streaming uses Server-Sent Events (SSE): one long HTTP response made of small
text frames:   event: token\\ndata: {"text": "Hello"}\\n\\n
Events we send:  meta (session + sources found) -> token* -> done   | error
"""

import json
import logging
import re
import time
from collections.abc import Iterator

from app.db.repository import Row
from app.retrieval.query_rewrite import format_history, rewrite_query
from app.retrieval.retriever import Retriever
from app.retrieval.scope import Scope
from app.services import Services

logger = logging.getLogger(__name__)

CHAT_SYSTEM_PROMPT = """You are StudyForge, a study assistant that answers ONLY from the provided context.
Rules:
1. Use only facts found in the CONTEXT passages. Never use outside knowledge for facts.
2. After every sentence that states a fact, cite the passage(s) it came from, like [S1] or [S2][S4].
   Book sections are labelled [B1], [B2]: cite them the same way. Use only labels that appear in the context.
3. If the context does not contain the answer, say exactly: "I couldn't find that in your sources."
   and optionally suggest what to upload or ask instead. Do not guess.
4. Be clear and well-structured; use short paragraphs or bullet points and markdown where it helps.
5. Answer in English."""

NO_CONTEXT_ANSWER = "I couldn't find that in your sources. Try rephrasing, or upload a document that covers it."
_LABEL = re.compile(r"\b([SB]\d+)\b")


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, default=str)}\n\n"


def build_chat_prompt(context: str, history: list[Row], question: str) -> str:
    history_text = format_history(history) if history else "(no previous messages)"
    return (
        f"CONTEXT:\n{context}\n\n"
        f"CONVERSATION SO FAR:\n{history_text}\n\n"
        f"QUESTION: {question}\n\n"
        "Answer using only the context, citing [S#] labels."
    )


def used_citations(answer: str, citations: list[dict]) -> list[dict]:
    """Keep only the citations the model actually referenced, in label order."""
    used = set(_LABEL.findall(answer))
    return [c for c in citations if c["label"] in used]


def session_title(message: str, limit: int = 70) -> str:
    """The first line of the first question, cut at a word boundary: "How does X decide whether to…"."""
    first = message.strip().splitlines()[0].strip() if message.strip() else ""
    if not first:
        return "New chat"
    if len(first) <= limit:
        return first
    cut = first[:limit].rsplit(" ", 1)[0].rstrip(",;:-")
    return f"{cut}…"


def get_or_create_session(services: Services, notebook: Row, user_id: str, session_id: str | None, message: str) -> Row:
    if session_id:
        session = services.repo.get_chat_session(session_id)
        if session and session["notebook_id"] == notebook["id"]:
            return session
    title = session_title(message)
    return services.repo.create_chat_session({"notebook_id": notebook["id"], "user_id": user_id, "title": title})


def chat_stream(
    services: Services,
    notebook: Row,
    user_id: str,
    message: str,
    session_id: str | None = None,
    source_ids: list[str] | None = None,
) -> Iterator[str]:
    cfg = services.settings
    repo = services.repo
    try:
        llm, _ = services.require_ai()
        session = get_or_create_session(services, notebook, user_id, session_id, message)
        history = repo.list_chat_messages(session["id"], limit=cfg.chat_max_history_turns * 2)
        repo.add_chat_message({"session_id": session["id"], "notebook_id": notebook["id"], "role": "user", "content": message})

        ready = [s["id"] for s in repo.list_sources(notebook["id"]) if s["status"] == "ready"]
        if source_ids:
            ready = [s for s in ready if s in set(source_ids)]

        standalone = rewrite_query(llm, message, history)
        citations: list[dict] = []
        context_text = ""
        if ready:
            result = Retriever(services).retrieve(standalone, Scope(notebook["id"], tuple(ready)), notebook["sources_version"])
            citations = [c.to_dict() for c in result.context.citations]
            context_text = result.context.text
            book_text, book_citations = _ask_the_book(services, notebook["id"], standalone)
            if book_text:
                context_text = f"{context_text}\n\nBOOK SECTIONS (written from these sources):\n{book_text}"
                citations += book_citations

        yield sse("meta", {"session_id": session["id"], "rewritten_query": standalone, "citations": citations})

        if not context_text:
            answer = NO_CONTEXT_ANSWER
            yield sse("token", {"text": answer})
        else:
            parts: list[str] = []
            deadline = time.monotonic() + cfg.llm_timeout_s
            for piece in llm.stream_text(build_chat_prompt(context_text, history, message), system=CHAT_SYSTEM_PROMPT):
                parts.append(piece)
                yield sse("token", {"text": piece})
                if time.monotonic() > deadline:
                    note = "\n\n_(answer cut short: time limit reached)_"
                    parts.append(note)
                    yield sse("token", {"text": note})
                    break
            answer = "".join(parts).strip() or NO_CONTEXT_ANSWER

        cited = used_citations(answer, citations)
        saved = repo.add_chat_message(
            {
                "session_id": session["id"],
                "notebook_id": notebook["id"],
                "role": "assistant",
                "content": answer,
                "rewritten_query": standalone if standalone != message else None,
                "citations": cited,
            }
        )
        repo.touch_chat_session(session["id"])
        yield sse("done", {"message_id": saved["id"], "session_id": session["id"], "citations": cited})
    except Exception as exc:  # noqa: BLE001 - the stream must end with a readable error, not a broken socket
        logger.exception("chat failed")
        yield sse("error", {"message": friendly_error(exc)})


def friendly_error(exc: Exception) -> str:
    text = str(exc)
    if "429" in text or "RESOURCE_EXHAUSTED" in text or "quota" in text.lower():
        return "The AI service is rate-limited right now (free tier). Please wait a minute and try again."
    if "not configured" in text or "API key" in text or "model" in text and "not found" in text:
        return text.split(": ", 1)[-1] if "failed on all providers" in text else text
    return "Something went wrong while answering. Please try again."


def _ask_the_book(services: Services, notebook_id: str, question: str) -> tuple[str, list[dict]]:
    """The book sections that best match the question, cited as [B#] (phase 5: ask the book)."""
    if not services.settings.book_enabled:
        return "", []
    try:
        from app.book.learner import book_context

        return book_context(services, notebook_id, question)
    except Exception:  # noqa: BLE001 - chat must work without the book tables
        logger.exception("book context unavailable")
        return "", []

"""Query rewriting for follow-up chat questions.

"What about its disadvantages?" is useless as a search query - "its" refers to
something from earlier in the chat. We ask the LLM to rewrite the follow-up into
a standalone question using recent history, and search with THAT.
Skipped for the first message of a chat (nothing to resolve, saves an API call).
"""

import logging

from app.db.repository import Row
from app.llm.base import LLM

logger = logging.getLogger(__name__)

REWRITE_PROMPT = """Rewrite the user's latest message into ONE standalone search question.
Resolve pronouns and references ("it", "that method", "the second one") using the conversation.
Keep technical terms exactly. If it is already standalone, return it unchanged.
Output only the rewritten question.

Conversation:
{history}

Latest message: {message}

Standalone question:"""


def format_history(messages: list[Row], max_chars_each: int = 500) -> str:
    return "\n".join(f"{m['role'].upper()}: {m['content'][:max_chars_each]}" for m in messages)


def rewrite_query(llm: LLM, message: str, history: list[Row]) -> str:
    if not history:
        return message
    prompt = REWRITE_PROMPT.format(history=format_history(history[-6:]), message=message)
    try:
        rewritten = llm.generate_text(prompt, fast=True).text.strip().strip('"')
    except Exception as exc:  # noqa: BLE001 - fall back to the raw message
        logger.warning("query rewrite failed: %s", exc)
        return message
    return rewritten if 0 < len(rewritten) < 500 else message

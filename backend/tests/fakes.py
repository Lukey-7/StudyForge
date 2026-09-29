"""Test doubles: a fake LLM and a fake embedder, so tests never need an API key."""

import hashlib
import json
import math
import re
from collections.abc import Iterator

from pydantic import BaseModel

from app.book.schemas import Outline, Placement, SectionDraft, SupportVerdicts
from app.generation import schemas as s
from app.knowledge.schemas import Extraction, Verdicts
from app.llm.base import LLMJson, LLMText
from app.text_utils import tokenize

DIM = 128

SAMPLE_OUTPUTS: dict[type[BaseModel], dict] = {
    s.SummaryOutput: {"title": "T", "summary_paragraphs": ["p1"], "key_points": ["k1"]},
    s.KeyConceptsOutput: {"concepts": [{"name": "n", "definition": "d", "why_it_matters": "w", "example": "e"}]},
    s.FAQOutput: {"items": [{"question": "q", "answer": "a"}]},
    s.QuizOutput: {"questions": [{"question": "q", "options": ["a", "b", "c", "d"], "correct_index": 2, "explanation": "x"}]},
    s.FlashcardsOutput: {"cards": [{"front": "f", "back": "b"}]},
    s.ExamNotesOutput: {"sections": [{"heading": "h", "bullets": ["b"]}], "likely_exam_questions": ["q"]},
    s.StudyGuideOutput: {
        "learning_objectives": ["o"],
        "sections": [{"title": "t", "content": "c", "check_yourself": ["q"]}],
        "key_takeaways": ["k"],
    },
    s.OutlineOutput: {"title": "t", "items": [{"title": "i", "level": 1, "summary": "s"}]},
    s.MindMapOutput: {"root": "Databases", "branches": [{"label": "Indexes (B-tree)", "children": ["fast lookups"]}]},
    s.GlossaryOutput: {"terms": [{"term": "t", "definition": "d"}]},
    s.TimelineOutput: {"has_dated_events": True, "events": [{"date": "1970", "title": "t", "description": "d"}]},
    s.PracticeProblemsOutput: {
        "problems": [{"problem": "p", "difficulty": "beginner", "solution_steps": ["s"], "final_answer": "a"}]
    },
    s.SimpleExplanationOutput: {"title": "t", "analogy": "a", "explanation_paragraphs": ["p"], "key_takeaways": ["k"]},
    s.CompareContrastOutput: {"concepts": ["A", "B"], "rows": [{"aspect": "speed", "values": ["fast", "slow"]}], "summary": "s"},
    s.PodcastOutput: {
        "title": "t",
        "speakers": ["Alex", "Sam"],
        "lines": [{"speaker": "Alex", "text": "hi"}, {"speaker": "Sam", "text": "hello"}],
    },
    s.TextbookChapterOutput: {
        "title": "t",
        "introduction": "i",
        "sections": [{"heading": "h", "content_markdown": "c"}],
        "summary": "s",
        "review_questions": ["q"],
    },
}


class FakeLLM:
    """Records prompts; returns canned but schema-valid answers."""

    def __init__(self, answer: str = "Indexes speed up lookups [S1].") -> None:
        self.answer = answer
        self.prompts: list[str] = []
        self.json_outputs: dict[type[BaseModel], list[str]] = {}  # optional scripted raw outputs

    @property
    def model_name(self) -> str:
        return "fake-llm"

    def generate_text(self, prompt: str, *, system: str | None = None, fast: bool = False) -> LLMText:
        self.prompts.append(prompt)
        if "Standalone question" in prompt:
            return LLMText("What are the disadvantages of B-tree indexes?", self.model_name)
        return LLMText("- condensed note", self.model_name)

    def generate_json(self, prompt: str, schema, *, system: str | None = None, fast: bool = False) -> LLMJson:
        self.prompts.append(prompt)
        scripted = self.json_outputs.get(schema)
        if scripted:
            from app.llm.json_output import generate_validated

            outputs = iter(scripted)
            return LLMJson(generate_validated(lambda _p: next(outputs), prompt, schema), self.model_name)
        if schema is Extraction:
            return LLMJson(fake_extraction(prompt), self.model_name)
        if schema is Verdicts:
            return LLMJson(fake_verdicts(prompt), self.model_name)
        if schema in BOOK_FAKES:
            return LLMJson(BOOK_FAKES[schema](prompt), self.model_name)
        if schema not in SAMPLE_OUTPUTS:  # e.g. the LLM rerank: keep the given order
            return LLMJson(schema.model_validate({"ranked_ids": []}), self.model_name)
        return LLMJson(schema.model_validate(SAMPLE_OUTPUTS[schema]), self.model_name)

    def stream_text(self, prompt: str, *, system: str | None = None) -> Iterator[str]:
        self.prompts.append(prompt)
        for word in self.answer.split(" "):
            yield word + " "

    def read_media(self, data: bytes, mime_type: str, instruction: str) -> LLMText:
        return LLMText("OCR TEXT from image", self.model_name)


class FakeEmbedder:
    """Hashed bag-of-words vectors: texts sharing words get similar vectors. Deterministic."""

    def __init__(self) -> None:
        self.calls = 0

    @property
    def active_model(self) -> str:
        return "fake-embedding"

    def _vector(self, text: str) -> list[float]:
        vector = [0.0] * DIM
        for word in tokenize(text):
            bucket = int(hashlib.md5(word.encode()).hexdigest(), 16) % DIM
            vector[bucket] += 1.0
        norm = math.sqrt(sum(v * v for v in vector)) or 1.0
        return [v / norm for v in vector]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        self.calls += 1
        return [self._vector(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vector(text)


def json_of(schema: type[BaseModel]) -> str:
    return json.dumps(SAMPLE_OUTPUTS[schema])


# ---------------------------------------------------------------- knowledge-model fakes
# Terms the fake "recognises" in passages; each sentence mentioning one becomes a claim about it.
FAKE_TERMS = {"index": "Index", "transaction": "Transaction", "deadlock": "Deadlock", "b-tree": "B-tree"}
NEGATIONS = (" not ", " cannot ", " never ", " only one", " several ")
PASSAGE = re.compile(r"\[P(\d+)\][^\n]*\n(.*?)(?=\n\n\[P\d+\]|\Z)", re.S)
PAIR = re.compile(r"Pair (\d+):\nA: (.*)\nB: (.*)")


def fake_extraction(prompt: str) -> Extraction:
    concepts, claims = {}, []
    for number, text in PASSAGE.findall(prompt):
        for sentence in re.split(r"(?<=[.!?])\s+|\n+", text.strip()):
            if not sentence.strip() or sentence.lstrip().startswith("#"):
                continue  # headings are not claims
            lower = sentence.lower()
            for key, name in FAKE_TERMS.items():
                if key in lower:
                    concepts.setdefault(
                        name, {"name": name, "kind": "term", "definition": sentence, "aliases": [], "passage": int(number)}
                    )
                    claims.append({"concept": name, "text": sentence, "passage": int(number)})
    links = [{"from_concept": "B-tree", "to_concept": "Index", "kind": "part_of"}] if {"B-tree", "Index"} <= set(concepts) else []
    return Extraction.model_validate({"concepts": list(concepts.values()), "claims": claims, "links": links})


def fake_verdicts(prompt: str) -> Verdicts:
    """same if the two statements are identical ignoring case; contradicts if exactly one of them
    carries a negation/quantity word; otherwise unrelated."""
    verdicts = []
    for number, a, b in PAIR.findall(prompt):
        neg_a = any(n in f" {a.lower()} " for n in NEGATIONS)
        neg_b = any(n in f" {b.lower()} " for n in NEGATIONS)
        if a.strip().lower() == b.strip().lower():
            verdict = "same"
        elif neg_a != neg_b:
            verdict = "contradicts"
        else:
            verdict = "unrelated"
        verdicts.append({"pair": int(number), "verdict": verdict})
    return Verdicts.model_validate({"verdicts": verdicts})


# ---------------------------------------------------------------- book fakes
CONCEPT_LINE = re.compile(r"^\[C(\d+)\] (.+?) \((?:term|example)\)", re.M)
BOOK_PASSAGE = re.compile(r"^\[P(\d+)\] \(.*\)\n(.+)$", re.M)


def fake_outline(prompt: str) -> Outline:
    """One chapter; a section per concept, titled by it, in the order given."""
    sections = [{"title": name, "concepts": [int(i)]} for i, name in CONCEPT_LINE.findall(prompt)]
    return Outline.model_validate({"chapters": [{"title": "Basics", "sections": sections}]})


def fake_placement(prompt: str) -> Placement:
    """Every new concept gets a new section of its own in the first chapter."""
    placements = [
        {"concept": int(i), "section": -1, "chapter": 0, "new_section_title": name, "new_chapter_title": ""}
        for i, name in CONCEPT_LINE.findall(prompt.split("NEW CONCEPTS:")[1])
    ]
    return Placement.model_validate({"placements": placements})


def fake_section(prompt: str) -> SectionDraft:
    """A paragraph per passage, quoting its first line, citing it."""
    paragraphs = [{"text": text.strip(), "passages": [int(i)]} for i, text in BOOK_PASSAGE.findall(prompt)]
    return SectionDraft.model_validate({"paragraphs": paragraphs or [{"text": "Nothing yet.", "passages": []}], "see_also": []})


PARAGRAPH_LINE = re.compile(r"^\[Q(\d+)\]", re.M)


def fake_support(prompt: str) -> SupportVerdicts:
    """Every paragraph judged supported (the fake sections quote their passages)."""
    verdicts = [{"paragraph": int(i), "verdict": "supported", "reason": ""} for i in PARAGRAPH_LINE.findall(prompt)]
    return SupportVerdicts.model_validate({"verdicts": verdicts})


BOOK_FAKES = {Outline: fake_outline, Placement: fake_placement, SectionDraft: fake_section, SupportVerdicts: fake_support}


# ---------------------------------------------------------------- vector store
def _matches(meta: dict, where: dict) -> bool:
    """The subset of Chroma's `where` language the app uses: equality, $and, $in, $gte, $lte."""
    for key, cond in where.items():
        if key == "$and":
            if not all(_matches(meta, c) for c in cond):
                return False
        elif isinstance(cond, dict):
            value = meta.get(key)
            for op, arg in cond.items():
                if op == "$in" and value not in arg:
                    return False
                if op == "$gte" and (value is None or value < arg):
                    return False
                if op == "$lte" and (value is None or value > arg):
                    return False
        elif meta.get(key) != cond:
            return False
    return True


class FakeVectorStore:
    """Exact, in-memory stand-in for ChromaVectorStore (same methods and filter semantics).

    Unit tests used a shared in-memory Chroma; Chroma 1.5 failed there now and then with internal
    errors ("Error finding id", "Nothing found on disk"), which made the suite flaky. Chroma itself
    is not what these tests check, so they get an exact cosine search instead."""

    def __init__(self) -> None:
        self.items: dict[tuple[str, str], dict[str, tuple[list[float], dict]]] = {}  # (model, kind) -> id -> (vector, meta)

    def _kind(self, model: str, kind: str) -> dict:
        return self.items.setdefault((model, kind), {})

    def upsert(self, model, ids, embeddings, metadatas, kind="chunks") -> None:
        for i, v, m in zip(ids, embeddings, metadatas):
            self._kind(model, kind)[i] = (list(v), dict(m))

    def query(self, model, embedding, k, where, kind="chunks"):
        norm_q = math.sqrt(sum(x * x for x in embedding)) or 1.0
        scored = []
        for item_id, (v, meta) in self._kind(model, kind).items():
            if _matches(meta, where):
                norm_v = math.sqrt(sum(x * x for x in v)) or 1.0
                scored.append((item_id, sum(a * b for a, b in zip(embedding, v)) / (norm_q * norm_v)))
        return sorted(scored, key=lambda x: -x[1])[:k]

    def get_embeddings(self, model, ids):
        chunks = self._kind(model, "chunks")
        return {i: chunks[i][0] for i in ids if i in chunks}

    def count(self, model, notebook_id) -> int:
        return sum(1 for _, meta in self._kind(model, "chunks").values() if meta.get("notebook_id") == notebook_id)

    def delete_ids(self, model, ids, kind) -> None:
        for i in ids:
            self._kind(model, kind).pop(i, None)

    def _delete_everywhere(self, where: dict) -> None:
        for items in self.items.values():
            for i in [i for i, (_, meta) in items.items() if _matches(meta, where)]:
                del items[i]

    def delete_source(self, source_id: str) -> None:
        self._delete_everywhere({"source_id": source_id})

    def delete_notebook(self, notebook_id: str) -> None:
        self._delete_everywhere({"notebook_id": notebook_id})

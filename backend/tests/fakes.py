"""Test doubles: a fake LLM and a fake embedder, so tests never need an API key."""

import hashlib
import json
import math
from collections.abc import Iterator

from pydantic import BaseModel

from app.generation import schemas as s
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

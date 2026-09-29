"""Output schemas for the 16 content-generation pipelines.

Each Pydantic model is (a) sent to Gemini as the required JSON schema, and
(b) used to VALIDATE what comes back. `model_validator`s add rules a JSON
schema can't express (e.g. the quiz answer index must point at a real option);
a failure is fed back to the model for one repair attempt.
"""

from typing import Literal

from pydantic import BaseModel, Field, model_validator

Difficulty = Literal["beginner", "intermediate", "advanced"]
Length = Literal["short", "medium", "long"]


class GenerationParams(BaseModel):
    """What makes a generation 'personalized'. Every field changes the prompt."""

    difficulty: Difficulty = "intermediate"
    length: Length = "medium"
    focus_topic: str | None = Field(default=None, max_length=200)
    source_ids: list[str] | None = None  # None = all ready sources in the notebook


# 1 ---------------------------------------------------------------- summary
class SummaryOutput(BaseModel):
    title: str
    summary_paragraphs: list[str] = Field(min_length=1)
    key_points: list[str]


# 2 ----------------------------------------------------------- key concepts
class Concept(BaseModel):
    name: str
    definition: str
    why_it_matters: str
    example: str


class KeyConceptsOutput(BaseModel):
    concepts: list[Concept] = Field(min_length=1)


# 3 -------------------------------------------------------------------- FAQ
class QA(BaseModel):
    question: str
    answer: str


class FAQOutput(BaseModel):
    items: list[QA] = Field(min_length=1)


# 4 ------------------------------------------------------------------- quiz
class MCQ(BaseModel):
    question: str
    options: list[str] = Field(min_length=2, max_length=6)
    correct_index: int = Field(description="0-based index into options")
    explanation: str

    @model_validator(mode="after")
    def answer_points_at_an_option(self) -> "MCQ":
        if not 0 <= self.correct_index < len(self.options):
            raise ValueError(f"correct_index {self.correct_index} is outside options (0..{len(self.options) - 1})")
        return self


class QuizOutput(BaseModel):
    questions: list[MCQ] = Field(min_length=1)


# 5 ------------------------------------------------------------- flashcards
class Flashcard(BaseModel):
    front: str
    back: str


class FlashcardsOutput(BaseModel):
    cards: list[Flashcard] = Field(min_length=1)


# 6 -------------------------------------------------------- exam revision
class NoteSection(BaseModel):
    heading: str
    bullets: list[str]


class ExamNotesOutput(BaseModel):
    sections: list[NoteSection] = Field(min_length=1)
    likely_exam_questions: list[str]


# 7 ------------------------------------------------------------ study guide
class GuideSection(BaseModel):
    title: str
    content: str = Field(description="Markdown")
    check_yourself: list[str]


class StudyGuideOutput(BaseModel):
    learning_objectives: list[str] = Field(min_length=1)
    sections: list[GuideSection] = Field(min_length=1)
    key_takeaways: list[str]


# 8 ---------------------------------------------------------------- outline
class OutlineItem(BaseModel):
    title: str
    level: int = Field(ge=1, le=3, description="1 = chapter, 2 = section, 3 = subsection")
    summary: str


class OutlineOutput(BaseModel):
    title: str
    items: list[OutlineItem] = Field(min_length=1)


# 9 --------------------------------------------------------------- mind map
class MindMapBranch(BaseModel):
    label: str
    children: list[str]


class MindMapOutput(BaseModel):
    root: str
    branches: list[MindMapBranch] = Field(min_length=1)


# 10 -------------------------------------------------------------- glossary
class GlossaryTerm(BaseModel):
    term: str
    definition: str


class GlossaryOutput(BaseModel):
    terms: list[GlossaryTerm] = Field(min_length=1)


# 11 -------------------------------------------------------------- timeline
class TimelineEvent(BaseModel):
    date: str
    title: str
    description: str


class TimelineOutput(BaseModel):
    has_dated_events: bool = Field(description="false if the material contains no dates or ordered events")
    events: list[TimelineEvent]


# 12 ----------------------------------------------------- practice problems
class PracticeProblem(BaseModel):
    problem: str
    difficulty: Difficulty
    solution_steps: list[str] = Field(min_length=1)
    final_answer: str


class PracticeProblemsOutput(BaseModel):
    problems: list[PracticeProblem] = Field(min_length=1)


# 13 -------------------------------------------------- simplified explanation
class SimpleExplanationOutput(BaseModel):
    title: str
    analogy: str
    explanation_paragraphs: list[str] = Field(min_length=1)
    key_takeaways: list[str]


# 14 ---------------------------------------------------- compare & contrast
class CompareRow(BaseModel):
    aspect: str
    values: list[str] = Field(description="one value per concept, same order as `concepts`")


class CompareContrastOutput(BaseModel):
    concepts: list[str] = Field(min_length=2)
    rows: list[CompareRow] = Field(min_length=1)
    summary: str

    @model_validator(mode="after")
    def one_value_per_concept(self) -> "CompareContrastOutput":
        for row in self.rows:
            if len(row.values) != len(self.concepts):
                raise ValueError(f"row {row.aspect!r} has {len(row.values)} values but there are {len(self.concepts)} concepts")
        return self


# 15 --------------------------------------------------------------- podcast
class DialogueLine(BaseModel):
    speaker: str
    text: str


class PodcastOutput(BaseModel):
    title: str
    speakers: list[str] = Field(min_length=2)
    lines: list[DialogueLine] = Field(min_length=2)


# 16 ------------------------------------------------------ textbook chapter
class ChapterSection(BaseModel):
    heading: str
    content_markdown: str


class TextbookChapterOutput(BaseModel):
    title: str
    introduction: str
    sections: list[ChapterSection] = Field(min_length=1)
    summary: str
    review_questions: list[str]

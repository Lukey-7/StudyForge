"""The pipeline registry: 16 pipelines described as DATA, run by ONE runner.

Adding a 17th pipeline = add one PipelineSpec + one output schema. No new code paths.

retrieval_strategy decides WHICH text the model sees:
  * whole_notebook_map_reduce - every chunk (map-reduce if it's too long).
    For outputs that must cover everything: summary, outline, notes, mind map.
  * top_k_for_topic           - the multi-layer retriever, query = focus topic
    (or the pipeline's default query). For outputs about the most relevant bits.
  * per_source                - each source condensed separately, then combined.
    For outputs that must give every document a fair share: textbook, podcast.
"""

from dataclasses import dataclass, field
from typing import Literal

from pydantic import BaseModel

from app.generation import schemas as s

Strategy = Literal["whole_notebook_map_reduce", "top_k_for_topic", "per_source"]


@dataclass(frozen=True)
class PipelineSpec:
    name: str
    title: str
    description: str
    retrieval_strategy: Strategy
    prompt_template: str  # may use {count}
    output_schema: type[BaseModel]
    counts: dict[str, int] = field(default_factory=lambda: {"short": 5, "medium": 10, "long": 20})
    default_query: str = "main ideas, key definitions and important details"
    default_params: dict = field(default_factory=lambda: {"difficulty": "intermediate", "length": "medium"})


PIPELINES: list[PipelineSpec] = [
    PipelineSpec(
        "summary",
        "Summary",
        "A structured summary with the key points.",
        "whole_notebook_map_reduce",
        "Write a summary of the material in about {count} paragraphs, then list the most important key points.",
        s.SummaryOutput,
        counts={"short": 1, "medium": 3, "long": 6},
    ),
    PipelineSpec(
        "key_concepts",
        "Key Concepts",
        "The core concepts with definitions, importance and an example.",
        "top_k_for_topic",
        "Identify the {count} most important concepts. For each give a precise definition, why it matters, "
        "and a concrete example taken from or consistent with the material.",
        s.KeyConceptsOutput,
        counts={"short": 5, "medium": 8, "long": 15},
        default_query="core concepts, definitions, principles and key terms",
    ),
    PipelineSpec(
        "faq",
        "FAQ",
        "Likely exam questions with model answers.",
        "top_k_for_topic",
        "Write {count} likely exam questions a student would be asked about this material, each with a "
        "complete model answer that would earn full marks.",
        s.FAQOutput,
        counts={"short": 5, "medium": 10, "long": 15},
        default_query="important facts, explanations, causes, processes and comparisons likely to be examined",
    ),
    PipelineSpec(
        "quiz",
        "MCQ Quiz",
        "Multiple-choice questions with answers and explanations.",
        "top_k_for_topic",
        "Write {count} multiple-choice questions with exactly 4 options each. Exactly one option is correct; "
        "distractors must be plausible. Set correct_index (0-based) and explain why the answer is right and "
        "the others are wrong. Test understanding, not trivia.",
        s.QuizOutput,
        default_query="key facts, definitions, processes and relationships that can be tested",
    ),
    PipelineSpec(
        "flashcards",
        "Flashcards",
        "Front/back cards for spaced repetition.",
        "top_k_for_topic",
        "Write {count} flashcards. Front: a short question or term. Back: a concise, self-contained answer "
        "(max 2 sentences). One fact per card.",
        s.FlashcardsOutput,
        counts={"short": 10, "medium": 20, "long": 35},
        default_query="definitions, facts, formulas and key terms worth memorising",
    ),
    PipelineSpec(
        "exam_notes",
        "Exam Revision Notes",
        "Ultra-compressed bullet notes for last-minute revision.",
        "whole_notebook_map_reduce",
        "Write ultra-compressed revision notes grouped into sections. Bullets only, max one line each, "
        "**bold** every key term. About {count} sections. End with 5 likely exam questions.",
        s.ExamNotesOutput,
        counts={"short": 3, "medium": 6, "long": 10},
    ),
    PipelineSpec(
        "study_guide",
        "Study Guide",
        "Learning objectives, guided sections and check-yourself questions.",
        "whole_notebook_map_reduce",
        "Write a study guide: learning objectives, then about {count} sections that teach the material "
        "(markdown content), each ending with 2-3 'check yourself' questions, then key takeaways.",
        s.StudyGuideOutput,
        counts={"short": 3, "medium": 5, "long": 8},
    ),
    PipelineSpec(
        "outline",
        "Outline",
        "A hierarchical table of contents of the material.",
        "whole_notebook_map_reduce",
        "Write a hierarchical outline (levels 1-3) of the material, in the order it is presented, with a "
        "one-sentence summary per item. Roughly {count} items.",
        s.OutlineOutput,
        counts={"short": 8, "medium": 15, "long": 30},
    ),
    PipelineSpec(
        "mind_map",
        "Mind Map",
        "A mind map (rendered with Mermaid) of the main ideas.",
        "whole_notebook_map_reduce",
        "Build a mind map: one central root topic, about {count} main branches, each with 2-5 short child "
        "nodes. Labels must be under 8 words, no quotes, brackets or parentheses.",
        s.MindMapOutput,
        counts={"short": 4, "medium": 6, "long": 9},
    ),
    PipelineSpec(
        "glossary",
        "Glossary",
        "Alphabetical list of terms and definitions.",
        "top_k_for_topic",
        "Write a glossary of {count} technical terms used in the material, sorted alphabetically, each with "
        "a clear one or two sentence definition based on the material.",
        s.GlossaryOutput,
        counts={"short": 10, "medium": 20, "long": 40},
        default_query="technical terms, acronyms, definitions and named concepts",
    ),
    PipelineSpec(
        "timeline",
        "Timeline",
        "Dated events in chronological order (if the material has any).",
        "whole_notebook_map_reduce",
        "Extract up to {count} dated or clearly ordered events and list them chronologically. If the material "
        "contains no dates or sequence of events, set has_dated_events=false and return an empty list. "
        "Never invent dates.",
        s.TimelineOutput,
        counts={"short": 8, "medium": 15, "long": 30},
    ),
    PipelineSpec(
        "practice_problems",
        "Practice Problems",
        "Problems with step-by-step worked solutions.",
        "top_k_for_topic",
        "Write {count} practice problems that apply the material (calculations, applications or analysis). "
        "Give a numbered step-by-step worked solution and a final answer for each.",
        s.PracticeProblemsOutput,
        counts={"short": 3, "medium": 5, "long": 10},
        default_query="methods, formulas, algorithms, procedures and worked examples",
    ),
    PipelineSpec(
        "simple_explanation",
        "Explain Simply",
        "Explain it like I'm new to this, with an analogy.",
        "top_k_for_topic",
        "Explain the topic to someone new to it: start with an everyday analogy, then about {count} short "
        "paragraphs in plain language, then key takeaways.",
        s.SimpleExplanationOutput,
        counts={"short": 2, "medium": 4, "long": 7},
        default_query="the central idea and how it works",
    ),
    PipelineSpec(
        "compare_contrast",
        "Compare & Contrast",
        "A comparison table between related concepts.",
        "top_k_for_topic",
        "Pick 2-4 related concepts from the material (use the focus topic if given) and compare them across "
        "about {count} aspects in a table: one value per concept per aspect. Finish with a short summary of "
        "when to use which.",
        s.CompareContrastOutput,
        counts={"short": 4, "medium": 6, "long": 10},
        default_query="alternatives, differences, advantages and disadvantages, comparisons between methods",
    ),
    PipelineSpec(
        "podcast",
        "Podcast Script",
        "A two-host dialogue that teaches the material.",
        "per_source",
        "Write an engaging podcast dialogue between two hosts, Alex (curious learner) and Sam (expert), that "
        "teaches the material. About {count} lines, natural and conversational, with a clear intro and outro.",
        s.PodcastOutput,
        counts={"short": 16, "medium": 30, "long": 50},
    ),
    PipelineSpec(
        "textbook_chapter",
        "Textbook Chapter",
        "One coherent chapter compiled from all sources.",
        "per_source",
        "Compile ALL sources into one coherent textbook chapter: title, introduction, about {count} sections "
        "in markdown (merge overlapping content, keep a logical order, include examples), summary and review "
        "questions.",
        s.TextbookChapterOutput,
        counts={"short": 3, "medium": 5, "long": 8},
    ),
]

REGISTRY: dict[str, PipelineSpec] = {p.name: p for p in PIPELINES}
assert len(REGISTRY) == 16, "the resume says 16 pipelines"

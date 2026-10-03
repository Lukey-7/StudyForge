"""What Gemini returns when it plans the outline and writes a section (structured output)."""

from typing import Literal

from pydantic import BaseModel, Field


class PlannedSection(BaseModel):
    title: str
    concepts: list[int] = Field(description="Numbers [C#] of the concepts this section teaches")


class PlannedChapter(BaseModel):
    title: str
    sections: list[PlannedSection]


class Outline(BaseModel):
    chapters: list[PlannedChapter]


class PlacedConcept(BaseModel):
    concept: int = Field(description="Number [C#] of the new concept")
    section: int = Field(description="Number [S#] of the existing section it belongs in, or -1 for a new section")
    chapter: int = Field(description="For a new section: number [K#] of its chapter, or -1 for a new chapter")
    new_section_title: str = Field(description="Title of the new section (empty when section >= 0)")
    new_chapter_title: str = Field(description="Title of the new chapter (empty unless chapter is -1)")


class Placement(BaseModel):
    placements: list[PlacedConcept]


class DraftParagraph(BaseModel):
    text: str = Field(description="One paragraph of plain prose, no Markdown")
    passages: list[int] = Field(description="Numbers [P#] of the passages this paragraph relies on")


class CodeExample(BaseModel):
    language: str = Field(description="Programming language, e.g. python, sql, bash")
    caption: str = Field(description="One sentence saying what the code shows")
    code: str = Field(description="The code itself, at most 25 lines")
    from_sources: bool = Field(description="true if the code appears in the passages, false if it is an illustrative example")
    passages: list[int] = Field(default_factory=list, description="Numbers [P#] of the passages the code comes from")


class SectionDraft(BaseModel):
    paragraphs: list[DraftParagraph]
    see_also: list[str] = Field(description="Names of other listed concepts a reader should look at next")
    code_examples: list[CodeExample] = Field(default_factory=list, description="Code examples for this section (often none)")
    steps_title: str = Field(default="", description="Title of the process the steps describe, or empty")
    steps: list[str] = Field(
        default_factory=list, description="3 to 8 short ordered steps of a process the passages describe, or empty"
    )


class ParagraphSupport(BaseModel):
    paragraph: int = Field(description="Number [Q#] of the paragraph judged")
    verdict: Literal["supported", "partial", "unsupported"]
    reason: str = Field(description="For partial or unsupported: what the passages do not back up (one short sentence)")


class SupportVerdicts(BaseModel):
    verdicts: list[ParagraphSupport]

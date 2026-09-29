"""What Gemini returns when it plans the outline and writes a section (structured output)."""

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


class SectionDraft(BaseModel):
    paragraphs: list[DraftParagraph]
    see_also: list[str] = Field(description="Names of other listed concepts a reader should look at next")

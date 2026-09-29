"""What Gemini returns when it reads passages (structured output, validated by Pydantic)."""

from typing import Literal

from pydantic import BaseModel, Field


class ExtractedConcept(BaseModel):
    name: str = Field(description="Canonical name, as a glossary entry would title it")
    kind: Literal["term", "example"] = Field(
        description="term = a glossary-worthy idea; example = a named algorithm, system, person or worked example"
    )
    definition: str = Field(description="One sentence, from the passages only")
    aliases: list[str] = Field(description="Other names or abbreviations used in the passages")
    passage: int = Field(description="Number of the passage [P#] that defines or best introduces it")


class ExtractedClaim(BaseModel):
    concept: str = Field(description="Name of the concept this claim is about (one of the concepts)")
    text: str = Field(description="One self-contained factual statement from the passages")
    passage: int = Field(description="Number of the passage [P#] the claim comes from")


class ExtractedLink(BaseModel):
    from_concept: str
    to_concept: str
    kind: Literal["requires", "part_of", "contrasts_with"]


class ExtractedEvent(BaseModel):
    concept: str = Field(description="Name of the concept the event belongs to (one of the concepts)")
    date: str = Field(description="The date exactly as the passage gives it, e.g. 1970 or March 1986")
    year: int = Field(description="The year as a number, for ordering")
    event: str = Field(description="What happened, in one short phrase")
    passage: int = Field(description="Number of the passage [P#] it comes from")


class ExtractedTable(BaseModel):
    concept: str = Field(description="Name of the concept the table is about (one of the concepts)")
    title: str = Field(description="What the table shows, in a few words")
    columns: list[str] = Field(description="Column headings; the first column names the rows")
    rows: list[list[str]] = Field(description="The rows, cell by cell, numbers exactly as written")
    passage: int = Field(description="Number of the passage [P#] it comes from")


class Extraction(BaseModel):
    concepts: list[ExtractedConcept]
    claims: list[ExtractedClaim]
    links: list[ExtractedLink]
    events: list[ExtractedEvent] = Field(default_factory=list, description="Dated events the passages state (for timelines)")
    tables: list[ExtractedTable] = Field(
        default_factory=list, description="Tables of numbers the passages contain (for charts); none if there are none"
    )


class PairVerdict(BaseModel):
    pair: int = Field(description="Number of the pair being judged")
    verdict: Literal["same", "contradicts", "unrelated"]


class Verdicts(BaseModel):
    verdicts: list[PairVerdict]

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


class Extraction(BaseModel):
    concepts: list[ExtractedConcept]
    claims: list[ExtractedClaim]
    links: list[ExtractedLink]


class PairVerdict(BaseModel):
    pair: int = Field(description="Number of the pair being judged")
    verdict: Literal["same", "contradicts", "unrelated"]


class Verdicts(BaseModel):
    verdicts: list[PairVerdict]

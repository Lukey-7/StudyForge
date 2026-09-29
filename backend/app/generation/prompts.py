"""Prompt building. Personalisation = difficulty + length + focus topic, and each
one changes the actual words sent to the model (see build_prompt)."""

from app.generation.registry import PipelineSpec
from app.generation.schemas import GenerationParams

SYSTEM_PROMPT = """You are StudyForge, an expert university tutor who turns course material into study resources.
Rules:
- Use ONLY the source material provided. Do not add facts that are not supported by it.
- If the material does not cover something the task asks for, leave it out rather than inventing it.
- Write in clear English, regardless of the language of the material.
- Follow the JSON schema exactly."""

DIFFICULTY_GUIDE = {
    "beginner": (
        "The learner is NEW to this subject. Use plain language and short sentences, define every "
        "technical term the first time it appears, and prefer everyday analogies and concrete examples."
    ),
    "intermediate": (
        "The learner knows the basics. Use correct terminology, explain the reasoning behind ideas, and connect related concepts."
    ),
    "advanced": (
        "The learner is ADVANCED. Be precise and technical, skip basic definitions, and emphasise "
        "edge cases, derivations, trade-offs, limitations and connections between ideas."
    ),
}

LENGTH_GUIDE = {
    "short": "Keep it brief: only the essentials.",
    "medium": "Aim for balanced coverage with moderate detail.",
    "long": "Be thorough and detailed; cover secondary points too.",
}

MAP_PROMPT = """You are condensing one part of a larger set of study material.
Goal of the final document: {goal}
{focus}
Extract, as compact bullet-point notes, every fact, definition, example, date, formula and argument
from the text below that could be needed for that goal. Keep technical terms and numbers exact.
Keep the source name and page references. Do not add anything that is not in the text.

TEXT:
{text}

NOTES:"""


def personalization_block(params: GenerationParams) -> str:
    lines = [
        f"Difficulty: {params.difficulty}. {DIFFICULTY_GUIDE[params.difficulty]}",
        f"Length: {params.length}. {LENGTH_GUIDE[params.length]}",
    ]
    if params.focus_topic:
        lines.append(
            f"Focus topic: '{params.focus_topic}'. Concentrate on this topic and how the rest of the material relates to it."
        )
    return "\n".join(lines)


def build_prompt(spec: PipelineSpec, params: GenerationParams, material: str) -> str:
    task = spec.prompt_template.format(count=spec.counts[params.length])
    return (
        f"TASK ({spec.title}):\n{task}\n\n"
        f"PERSONALISATION:\n{personalization_block(params)}\n\n"
        f"SOURCE MATERIAL:\n{material}\n\n"
        "Now produce the JSON."
    )


def map_prompt(spec: PipelineSpec, params: GenerationParams, text: str) -> str:
    focus = f"Pay special attention to: {params.focus_topic}" if params.focus_topic else ""
    goal = f"{spec.title} - {spec.description}"
    return MAP_PROMPT.format(goal=goal, focus=focus, text=text)

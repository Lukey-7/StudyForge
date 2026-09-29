import pytest
from pydantic import ValidationError

from app.generation import schemas as s
from app.generation.map_reduce import group_by_tokens
from app.generation.mermaid import to_mermaid
from app.generation.prompts import build_prompt
from app.generation.registry import PIPELINES, REGISTRY
from app.generation.runner import params_hash
from app.generation.schemas import GenerationParams
from app.llm.json_output import StructuredOutputError, generate_validated, parse_model_json
from app.llm.rate_limit import RateLimiter, with_retries
from tests.fakes import SAMPLE_OUTPUTS


def test_there_are_exactly_16_pipelines_each_with_a_sample():
    assert len(REGISTRY) == 16
    assert {p.output_schema for p in PIPELINES} == set(SAMPLE_OUTPUTS)


@pytest.mark.parametrize("schema", list(SAMPLE_OUTPUTS))
def test_every_schema_accepts_its_sample(schema):
    schema.model_validate(SAMPLE_OUTPUTS[schema])
    assert schema.model_json_schema()["type"] == "object"


def test_quiz_rejects_answer_index_outside_options():
    with pytest.raises(ValidationError):
        s.MCQ(question="q", options=["a", "b"], correct_index=2, explanation="x")


def test_compare_rejects_wrong_number_of_values():
    with pytest.raises(ValidationError):
        s.CompareContrastOutput(concepts=["A", "B"], rows=[{"aspect": "x", "values": ["only one"]}], summary="s")


def test_parse_strips_code_fences():
    parsed = parse_model_json('```json\n{"items": [{"question": "q", "answer": "a"}]}\n```', s.FAQOutput)
    assert parsed.items[0].answer == "a"


def test_generate_validated_repairs_once_with_the_error_message():
    prompts = []
    answers = iter(['{"items": []}', '{"items": [{"question": "q", "answer": "a"}]}'])

    def call(prompt):
        prompts.append(prompt)
        return next(answers)

    result = generate_validated(call, "make a faq", s.FAQOutput)
    assert result.items[0].question == "q"
    assert len(prompts) == 2 and "Validation error" in prompts[1]


def test_generate_validated_gives_up_after_second_failure():
    with pytest.raises(StructuredOutputError):
        generate_validated(lambda _p: "not json", "x", s.FAQOutput)


def test_personalisation_changes_the_prompt():
    spec = REGISTRY["quiz"]
    beginner = build_prompt(spec, GenerationParams(difficulty="beginner", length="short"), "M")
    advanced = build_prompt(spec, GenerationParams(difficulty="advanced", length="long", focus_topic="B-trees"), "M")
    assert "NEW to this subject" in beginner and "Write 5 multiple-choice" in beginner
    assert "ADVANCED" in advanced and "Write 20 multiple-choice" in advanced and "B-trees" in advanced


def test_params_hash_is_stable_and_order_insensitive():
    a = GenerationParams(focus_topic=" Joins ", source_ids=["b", "a"])
    b = GenerationParams(focus_topic="joins", source_ids=["a", "b"])
    assert params_hash(a) == params_hash(b)
    assert params_hash(a) != params_hash(GenerationParams(difficulty="advanced"))


def test_mermaid_rendering_sanitises_labels():
    text = to_mermaid(s.MindMapOutput(root='SQL "Joins"', branches=[{"label": "Inner (default)", "children": ["a[b]"]}]))
    assert text.splitlines()[0] == "mindmap"
    assert "root((SQL Joins))" in text
    assert "(default)" not in text and "[" not in text.split("root", 1)[1].replace("((", "").replace("))", "")


def test_group_by_tokens():
    blocks = ["x" * 400] * 5  # 100 tokens each
    groups = group_by_tokens(blocks, group_tokens=250)
    assert [len(g) for g in groups] == [2, 2, 1]


def test_with_retries_retries_then_succeeds():
    attempts = []

    def flaky():
        attempts.append(1)
        if len(attempts) < 3:
            raise TimeoutError("slow")
        return "ok"

    assert with_retries(flaky, is_retryable=lambda e: isinstance(e, TimeoutError), base_delay_s=0) == "ok"
    assert len(attempts) == 3


def test_with_retries_does_not_retry_permanent_errors():
    attempts = []

    def broken():
        attempts.append(1)
        raise ValueError("bad request")

    with pytest.raises(ValueError):
        with_retries(broken, is_retryable=lambda e: isinstance(e, TimeoutError), base_delay_s=0)
    assert len(attempts) == 1


def test_rate_limiter_allows_up_to_rpm_without_waiting():
    limiter = RateLimiter(rpm=3, window_s=60)
    for _ in range(3):
        limiter.acquire()
    assert len(limiter._calls) == 3


def test_bad_gemini_key_is_reported_clearly_not_as_schema_or_model_error():
    from google.genai import errors

    from app.llm.gemini import is_auth_error, translate_error

    bad_key = errors.ClientError(
        400, {"error": {"code": 400, "message": "API key not valid. Please pass a valid API key.", "status": "INVALID_ARGUMENT"}}
    )
    other_400 = errors.ClientError(400, {"error": {"code": 400, "message": "Invalid JSON schema", "status": "INVALID_ARGUMENT"}})
    missing_model = errors.ClientError(404, {"error": {"code": 404, "message": "models/x is not found", "status": "NOT_FOUND"}})
    assert is_auth_error(bad_key) and not is_auth_error(other_400)
    assert "GEMINI_API_KEY" in str(translate_error(bad_key, "m"))
    assert "not found" in str(translate_error(missing_model, "x"))
    assert translate_error(other_400, "m") is other_400


def test_mermaid_apostrophes_do_not_leave_gaps():
    text = to_mermaid(s.MindMapOutput(root="DBMS", branches=[{"label": "SQL's foundation", "children": []}]))
    assert "SQLs foundation" in text

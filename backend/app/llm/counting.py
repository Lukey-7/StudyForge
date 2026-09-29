"""Counts the LLM calls a background job makes, so the app can show what a job cost."""


class CountingLLM:
    def __init__(self, llm) -> None:
        self._llm = llm
        self.calls = 0

    def generate_json(self, *args, **kwargs):
        self.calls += 1
        return self._llm.generate_json(*args, **kwargs)

    def __getattr__(self, name):  # everything else goes straight through
        return getattr(self._llm, name)

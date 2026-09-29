import { useState } from 'react'

// Interactive multiple-choice quiz. answers[i] = option index the user picked for question i.
export default function QuizView({ output }) {
  const questions = output.questions || []
  const [answers, setAnswers] = useState({})

  const answeredCount = Object.keys(answers).length
  const score = questions.filter((q, i) => answers[i] === q.correct_index).length
  const finished = answeredCount === questions.length && questions.length > 0

  function pick(questionIndex, optionIndex) {
    if (answers[questionIndex] !== undefined) return // one attempt per question
    setAnswers({ ...answers, [questionIndex]: optionIndex })
  }

  return (
    <div className="stack">
      <div className="quiz-progress mono-label">
        {answeredCount}/{questions.length} answered · score {score}
      </div>

      {questions.map((q, qi) => {
        const picked = answers[qi]
        const revealed = picked !== undefined
        return (
          <div key={qi} className="quiz-question">
            <p className="quiz-q">
              <strong>{qi + 1}.</strong> {q.question}
            </p>
            <div className="quiz-options">
              {q.options.map((option, oi) => {
                let state = ''
                if (revealed && oi === q.correct_index) state = 'correct'
                else if (revealed && oi === picked) state = 'incorrect'
                return (
                  <button key={oi} className={`quiz-option ${state}`} disabled={revealed} onClick={() => pick(qi, oi)}>
                    <span className="mono-label">{String.fromCharCode(65 + oi)}</span> {option}
                  </button>
                )
              })}
            </div>
            {revealed && (
              <p className={`quiz-explanation ${picked === q.correct_index ? 'text-green' : 'text-red'}`}>
                {picked === q.correct_index ? 'Correct! ' : 'Not quite. '}
                <span className="muted">{q.explanation}</span>
              </p>
            )}
          </div>
        )
      })}

      {finished && (
        <div className="quiz-result">
          <h3>
            You scored {score} / {questions.length}
          </h3>
          <button className="btn btn-secondary btn-sm" onClick={() => setAnswers({})}>
            Try again
          </button>
        </div>
      )}
    </div>
  )
}

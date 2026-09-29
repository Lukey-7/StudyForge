import { useState } from 'react'

// Interactive multiple-choice quiz.
//   round   - indexes of the questions in play (all of them, or just the missed ones on a retry)
//   answers - { questionIndex: optionIndex } picked in this round
export default function QuizView({ output }) {
  const questions = output.questions || []
  const [round, setRound] = useState(() => questions.map((_, i) => i))
  const [answers, setAnswers] = useState({})

  if (questions.length === 0) return <p className="muted">This quiz came back empty. Try generating it again.</p>

  const answered = round.filter((qi) => answers[qi] !== undefined)
  const missed = round.filter((qi) => answers[qi] !== undefined && answers[qi] !== questions[qi].correct_index)
  const finished = answered.length === round.length
  const isRetry = round.length < questions.length

  function pick(qi, oi) {
    if (answers[qi] !== undefined) return // one attempt per question per round
    setAnswers({ ...answers, [qi]: oi })
  }

  function startRound(indexes) {
    setRound(indexes)
    setAnswers({})
  }

  return (
    <div className="quiz">
      <p className="quiz-progress" role="status">
        {isRetry ? 'Retrying the ones you missed: ' : ''}
        {answered.length} of {round.length} answered
      </p>

      {round.map((qi) => (
        <Question key={qi} number={qi + 1} question={questions[qi]} picked={answers[qi]} onPick={(oi) => pick(qi, oi)} />
      ))}

      {finished && (
        <div className="quiz-result">
          <p className="quiz-score">
            You got {round.length - missed.length} of {round.length} right.
          </p>
          <div className="row">
            {missed.length > 0 && (
              <button className="btn btn-primary" onClick={() => startRound(missed)}>
                Retry the ones I missed
              </button>
            )}
            <button className="btn btn-secondary" onClick={() => startRound(questions.map((_, i) => i))}>
              Start the whole quiz again
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function Question({ number, question, picked, onPick }) {
  const revealed = picked !== undefined
  const correct = picked === question.correct_index

  return (
    <div className="quiz-question">
      <p className="quiz-q">
        <span className="quiz-number">{number}.</span> {question.question}
      </p>
      <div className="quiz-options">
        {(question.options || []).map((option, oi) => {
          let state = ''
          if (revealed && oi === question.correct_index) state = 'is-correct'
          else if (revealed && oi === picked) state = 'is-wrong'
          return (
            <button key={oi} className={`quiz-option ${state}`} disabled={revealed} onClick={() => onPick(oi)}>
              <span className="quiz-letter">{String.fromCharCode(65 + oi)}</span>
              <span>{option}</span>
            </button>
          )
        })}
      </div>
      {revealed && (
        <p className="quiz-explanation">
          <strong className={correct ? 'text-good' : 'text-bad'}>{correct ? 'Right.' : 'Not quite.'}</strong>{' '}
          {question.explanation}
        </p>
      )}
    </div>
  )
}

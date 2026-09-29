// Rows = aspects, columns = concepts. rows[i].values has one entry per concept (same order).
export default function CompareTableView({ output }) {
  const concepts = output.concepts || []
  const rows = output.rows || []

  return (
    <div className="stack">
      {/* wrapper scrolls sideways on phones instead of squashing the table */}
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Aspect</th>
              {concepts.map((c) => (
                <th key={c}>{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i}>
                <th scope="row">{row.aspect}</th>
                {concepts.map((c, ci) => (
                  <td key={c}>{row.values?.[ci] ?? ''}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {output.summary && <p>{output.summary}</p>}
    </div>
  )
}

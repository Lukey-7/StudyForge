// A mind map drawn with plain nested lists and CSS connector lines.
// Used on the landing page (no need to download mermaid there) and as the fallback
// when mermaid can't draw the model's diagram.
export default function MindTree({ output }) {
  return (
    <div className="mind-tree">
      <p className="mind-root">{output.root || 'Main idea'}</p>
      <ul>
        {(output.branches || []).map((branch, i) => (
          <li key={i}>
            <span className="mind-branch">{branch.label}</span>
            {branch.children?.length > 0 && (
              <ul>
                {branch.children.map((child, ci) => (
                  <li key={ci}>{child}</li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

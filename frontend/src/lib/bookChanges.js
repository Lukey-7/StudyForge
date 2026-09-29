import { plural } from './format'

// "2 new concepts, 1 new section, 3 sections revised": one line for a book change record.
export function changeSummary(changes) {
  return [
    changes.new_concepts?.length && plural(changes.new_concepts.length, 'new concept'),
    changes.added?.length && plural(changes.added.length, 'new section'),
    changes.revised?.length && `${plural(changes.revised.length, 'section')} revised`,
    changes.removed?.length && `${plural(changes.removed.length, 'section')} removed`,
  ]
    .filter(Boolean)
    .join(', ')
}

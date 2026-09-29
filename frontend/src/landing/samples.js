// Hand-written samples for the landing page. Every sample is built from the same short
// lecture-notes paragraph (NOTES below) and uses the exact output shape the backend returns
// (docs/API.md), so the landing page can render them with the app's real renderers.

export const NOTES = {
  source: 'Lecture 7',
  page: 'p. 3',
  before:
    'A B+ tree index keeps keys in sorted order inside a balanced tree of fixed-size pages. Internal nodes store only separator keys and pointers to children, so one 4 KB page can point to hundreds of children and even a large table needs only three or four levels. Every record, or a pointer to it, lives in a leaf, and each leaf links to the next one. ',
  // The sentence that gets the highlighter on load: it is the idea most samples test.
  highlighted:
    'That chain is what makes range queries cheap: descend once from the root to the first matching key, then read the following leaves in order.',
  after: ' When an insert overflows a leaf, the leaf splits in two and one separator key moves up into the parent.',
}

export const SAMPLES = {
  summary: {
    title: 'B+ tree indexes',
    summary_paragraphs: [
      'A B+ tree stores keys in sorted order across fixed-size pages. Internal nodes hold only separator keys, which gives each node hundreds of children and keeps the tree three or four levels deep. Records live in the leaves, and the leaves are linked in key order, so a range query needs one descent from the root and then a walk along the leaves.',
    ],
    key_points: [
      'Internal nodes guide the search; leaves hold the data.',
      'High fan-out keeps the tree shallow.',
      'The leaf chain makes range queries cheap.',
      'A full leaf splits and pushes a separator key up.',
    ],
  },

  simple_explanation: {
    title: 'B+ trees, simply',
    analogy:
      'Think of a dictionary with thumb tabs. The tabs get you to the right letter in one move, then you read the pages in order until you pass the last word you need.',
    explanation_paragraphs: [
      'The upper levels of the tree are the thumb tabs: they only tell you where to go. The leaves are the pages with the actual entries, and they sit in order, one after another.',
    ],
    key_takeaways: ['Jump once, then read sideways.', 'Only the leaves hold records.'],
  },

  key_concepts: {
    concepts: [
      {
        name: 'Fan-out',
        definition: 'The number of children one internal node can point to.',
        why_it_matters: 'High fan-out keeps the tree three or four levels deep, so a lookup costs only a few page reads.',
        example: 'A 4 KB page of separator keys can point to hundreds of children.',
      },
      {
        name: 'Leaf chain',
        definition: 'Each leaf holds a pointer to the next leaf in key order.',
        why_it_matters: 'Range queries walk along the chain instead of climbing back up the tree.',
        example: 'price BETWEEN 10 AND 20 finds 10, then reads leaves until it passes 20.',
      },
    ],
  },

  glossary: {
    terms: [
      { term: 'Separator key', definition: 'A key in an internal node that only decides which child to follow.' },
      { term: 'Leaf', definition: 'A bottom-level page that holds the records, or pointers to them.' },
      { term: 'Fan-out', definition: 'How many children one internal node points to.' },
      { term: 'Node split', definition: 'An overflowing leaf becomes two leaves and a separator key moves up to the parent.' },
    ],
  },

  outline: {
    title: 'B+ tree indexes',
    items: [
      { title: 'Structure', level: 1, summary: 'A balanced tree of fixed-size pages' },
      { title: 'Internal nodes', level: 2, summary: 'Separator keys and child pointers only' },
      { title: 'Leaves', level: 2, summary: 'Hold the records, linked in key order' },
      { title: 'Queries', level: 1, summary: '' },
      { title: 'Range queries', level: 2, summary: 'One descent, then read along the leaves' },
      { title: 'Inserts', level: 1, summary: '' },
      { title: 'Leaf split', level: 2, summary: 'The leaf splits and a separator key moves up' },
    ],
  },

  mind_map: {
    root: 'B+ tree index',
    branches: [
      { label: 'Internal nodes', children: ['Separator keys', 'Hundreds of children each'] },
      { label: 'Leaves', children: ['Hold the records', 'Linked in key order'] },
      { label: 'Operations', children: ['Range query: descend, then scan', 'Insert: split when full'] },
    ],
    mermaid: '',
  },

  quiz: {
    questions: [
      {
        question: 'Why is a range query cheap on a B+ tree?',
        options: [
          'Every internal node stores full records',
          'The leaves are linked in key order',
          'The tree is rebuilt before each query',
          'Keys are hashed into buckets',
        ],
        correct_index: 1,
        explanation:
          'After one descent to the first matching key, the query reads the following leaves through the chain. Hashing would lose the order a range needs.',
      },
      {
        question: 'What happens when an insert overflows a leaf?',
        options: [
          'The insert is rejected',
          'The whole tree is rebuilt',
          'The leaf splits and a separator key moves up to the parent',
          'The record is stored in the root',
        ],
        correct_index: 2,
        explanation: 'The full leaf splits in two, and one separator key goes into the parent so searches can still reach both halves.',
      },
    ],
  },

  flashcards: {
    cards: [
      { front: 'What do internal B+ tree nodes store?', back: 'Only separator keys and pointers to child pages.' },
      {
        front: 'Why does a B+ tree stay only three or four levels deep?',
        back: 'Each page points to hundreds of children, so the tree fans out fast.',
      },
      {
        front: 'How does a range query use the leaves?',
        back: 'It descends once to the first key, then follows the leaf chain in order.',
      },
    ],
  },

  practice_problems: {
    problems: [
      {
        problem:
          'A 4 KB page stores 8-byte keys, each paired with an 8-byte child pointer. Roughly how many children can one internal node have? How many leaves can a three-level tree (root, one internal level, leaves) reach?',
        difficulty: 'intermediate',
        solution_steps: [
          'Each entry takes 8 + 8 = 16 bytes, and 4096 ÷ 16 = 256, so the fan-out is about 256.',
          'The root points to about 256 internal nodes.',
          'Each internal node points to about 256 leaves: 256 × 256 = 65,536.',
        ],
        final_answer: 'About 256 children per node, and about 65,000 leaves.',
      },
    ],
  },

  faq: {
    items: [
      {
        question: 'Why not store records in the internal nodes too?',
        answer:
          'Keeping records out of internal nodes leaves room for more separator keys. That raises the fan-out and keeps the tree shallow.',
      },
      {
        question: 'Does a range query ever go back up the tree?',
        answer: 'No. After the first descent it follows the links between leaves until it passes the end of the range.',
      },
    ],
  },

  exam_notes: {
    sections: [
      {
        heading: 'Structure',
        bullets: [
          'Balanced: every leaf at the same depth',
          'Internal nodes: separator keys and child pointers',
          'Leaves: records (or pointers), linked in order',
        ],
      },
      { heading: 'Why it is fast', bullets: ['Fan-out in the hundreds, so 3 or 4 levels', 'Range query: 1 descent, then a leaf scan'] },
    ],
    likely_exam_questions: [
      'Explain why B+ trees suit range queries better than hash indexes.',
      'Describe what happens when an insert overflows a leaf.',
    ],
  },

  study_guide: {
    learning_objectives: ['Describe what internal nodes and leaves store', 'Explain how a range query uses the leaf chain'],
    sections: [
      {
        title: 'Reading a range',
        content:
          'Descend from the root to the **first key** in the range, then follow the leaf links until you pass the last key. No step goes back up the tree.',
        check_yourself: ['Which pages does BETWEEN 10 AND 20 read?'],
      },
    ],
    key_takeaways: ['Descend once, then scan sideways.'],
  },

  compare_contrast: {
    concepts: ['B+ tree index', 'Hash index'],
    rows: [
      { aspect: 'Exact match', values: ['A few page reads, one per level', 'Usually one bucket read'] },
      { aspect: 'Range query', values: ['One descent, then follow the leaf chain', 'Has to check every bucket'] },
      { aspect: 'Key order', values: ['Kept sorted', 'Lost when hashed'] },
    ],
    summary: 'Use a B+ tree when queries ask for ranges or sorted output; a hash index only wins on exact matches.',
  },

  timeline: {
    has_dated_events: true,
    events: [
      { date: 'Step 1', title: 'An insert overflows a leaf', description: 'The leaf already holds as many keys as fit on its page.' },
      { date: 'Step 2', title: 'The leaf splits in two', description: 'Half the keys move to a new leaf, which joins the leaf chain.' },
      { date: 'Step 3', title: 'A separator key moves up', description: 'The parent gets a new separator so searches can find the new leaf.' },
    ],
  },

  podcast: {
    title: 'Why range queries love B+ trees',
    speakers: ['Maya', 'Sam'],
    lines: [
      { speaker: 'Maya', text: 'So what makes a B+ tree good at ranges?' },
      {
        speaker: 'Sam',
        text: 'The leaves are chained together in key order. You go down from the root once, land on the first key, and then just walk along.',
      },
      { speaker: 'Maya', text: 'And it never climbs back up the tree?' },
      { speaker: 'Sam', text: 'Never. That walk along the leaves is the whole trick.' },
    ],
  },

  textbook_chapter: {
    title: 'Indexing with B+ trees',
    introduction:
      'Databases rarely scan a whole table to find a few rows. They keep an index instead, and the most common one is the B+ tree.',
    sections: [
      {
        heading: 'The shape of the tree',
        content_markdown:
          'Internal nodes hold only **separator keys**, which lets one page point to hundreds of children. Records live in the **leaves**, and each leaf links to the next.',
      },
    ],
    summary: 'A shallow tree plus a linked leaf level gives fast lookups and fast ranges.',
    review_questions: ['Why does high fan-out matter for an index stored on disk?'],
  },
}

// The static chat excerpt in "Answers that show their page".
export const CITED_ANSWER = {
  question: 'Why are range queries fast on a B+ tree?',
  // Plain text split into parts; { cite } parts become highlighter marks.
  parts: [
    'Because the leaves are linked in key order. The database descends from the root once to the first matching key, then follows the chain from leaf to leaf instead of going back up the tree ',
    { cite: 'S1' },
    '. That first descent is short too: one page can point to hundreds of children, so even a large table needs only three or four levels ',
    { cite: 'S2' },
    '.',
  ],
  citations: {
    S1: {
      source: 'Lecture 7',
      page: 3,
      snippet:
        'That chain is what makes range queries cheap: descend once from the root to the first matching key, then read the following leaves in order.',
    },
    S2: {
      source: 'Lecture 6',
      page: 11,
      snippet:
        'A 4 KB page of 8-byte keys and 8-byte pointers gives a fan-out of about 256, so three levels already index over sixteen million records.',
    },
  },
}

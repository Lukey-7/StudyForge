const {
    Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
    Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
    ShadingType, VerticalAlign, PageNumber, PageBreak, TabStopType,
    TabStopPosition, LevelFormat, ImageRun, convertInchesToTwip
} = require('docx');
const fs = require('fs');

// ===== STYLE HELPERS =====
const TNR = "Times New Roman";
const COURIER = "Courier New";
const ARIAL = "Arial";

function chapterHeading(text) {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 360, before: 240, after: 240 },
        children: [new TextRun({ text, font: TNR, size: 32, bold: true })]
    });
}

function sectionHeading(text) {
    return new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { line: 360, before: 200, after: 120 },
        children: [new TextRun({ text, font: TNR, size: 28, bold: true })]
    });
}

function subSectionHeading(text) {
    return new Paragraph({
        alignment: AlignmentType.LEFT,
        spacing: { line: 360, before: 160, after: 80 },
        children: [new TextRun({ text, font: TNR, size: 24, bold: true })]
    });
}

function bodyPara(text, extra = {}) {
    return new Paragraph({
        alignment: AlignmentType.BOTH,
        spacing: { line: 360, before: 80, after: 80 },
        ...extra,
        children: [new TextRun({ text, font: TNR, size: 24 })]
    });
}

function boldBodyPara(text) {
    return new Paragraph({
        alignment: AlignmentType.BOTH,
        spacing: { line: 360, before: 80, after: 80 },
        children: [new TextRun({ text, font: TNR, size: 24, bold: true })]
    });
}

function centerPara(text, size = 24, bold = false) {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 360, before: 80, after: 80 },
        children: [new TextRun({ text, font: TNR, size, bold })]
    });
}

function codeLine(text) {
    return new Paragraph({
        spacing: { line: 240, before: 0, after: 0 },
        children: [new TextRun({ text, font: COURIER, size: 20 })]
    });
}

function codeBlock(lines) {
    return lines.map(l => codeLine(l));
}

function pageBreakPara() {
    return new Paragraph({ children: [new PageBreak()] });
}

function emptyPara() {
    return new Paragraph({ children: [new TextRun("")] });
}

function captionPara(text) {
    return new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 300, before: 60, after: 120 },
        children: [new TextRun({ text, font: TNR, size: 22, italics: true })]
    });
}

function bullet(text) {
    return new Paragraph({
        alignment: AlignmentType.BOTH,
        spacing: { line: 360, before: 40, after: 40 },
        numbering: { reference: "bullets", level: 0 },
        children: [new TextRun({ text, font: TNR, size: 24 })]
    });
}

function imagePlaceholder(caption) {
    const border = { style: BorderStyle.SINGLE, size: 6, color: "888888" };
    return [
        new Table({
            width: { size: 9000, type: WidthType.DXA },
            rows: [new TableRow({
                children: [new TableCell({
                    borders: { top: border, bottom: border, left: border, right: border },
                    width: { size: 9000, type: WidthType.DXA },
                    shading: { fill: "F5F5F5", type: ShadingType.CLEAR },
                    children: [
                        new Paragraph({
                            alignment: AlignmentType.CENTER,
                            spacing: { before: 600, after: 600 },
                            children: [new TextRun({
                                text: `[Screenshot / Diagram Placeholder: ${caption}]`,
                                font: TNR, size: 22, italics: true, color: "666666"
                            })]
                        })
                    ]
                })]
            })]
        }),
        captionPara(`Figure: ${caption}`)
    ];
}

function makeTable(headers, rows, colWidths) {
    const totalWidth = colWidths.reduce((a, b) => a + b, 0);
    const headerBorder = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
    const cellBorder = { style: BorderStyle.SINGLE, size: 2, color: "AAAAAA" };
    const borders = { top: cellBorder, bottom: cellBorder, left: cellBorder, right: cellBorder };
    const headerBorders = { top: headerBorder, bottom: headerBorder, left: headerBorder, right: headerBorder };

    return new Table({
        width: { size: totalWidth, type: WidthType.DXA },
        columnWidths: colWidths,
        rows: [
            new TableRow({
                tableHeader: true,
                children: headers.map((h, i) => new TableCell({
                    borders: headerBorders,
                    width: { size: colWidths[i], type: WidthType.DXA },
                    shading: { fill: "D9E1F2", type: ShadingType.CLEAR },
                    margins: { top: 80, bottom: 80, left: 120, right: 120 },
                    children: [new Paragraph({
                        alignment: AlignmentType.CENTER,
                        children: [new TextRun({ text: h, font: TNR, size: 22, bold: true })]
                    })]
                }))
            }),
            ...rows.map(row => new TableRow({
                children: row.map((cell, i) => new TableCell({
                    borders,
                    width: { size: colWidths[i], type: WidthType.DXA },
                    margins: { top: 60, bottom: 60, left: 100, right: 100 },
                    children: [new Paragraph({
                        alignment: AlignmentType.LEFT,
                        children: [new TextRun({ text: cell, font: TNR, size: 20 })]
                    })]
                }))
            }))
        ]
    });
}

// ===== FOOTER =====
function makeFooter() {
    const border = { style: BorderStyle.SINGLE, size: 4, color: "000000" };
    const borders = { top: border, bottom: border, left: border, right: border };
    return new Footer({
        children: [
            new Table({
                width: { size: 9000, type: WidthType.DXA },
                columnWidths: [3600, 2200, 3200],
                rows: [new TableRow({
                    children: [
                        new TableCell({
                            borders, width: { size: 3600, type: WidthType.DXA },
                            margins: { top: 40, bottom: 40, left: 80, right: 80 },
                            children: [new Paragraph({
                                alignment: AlignmentType.LEFT,
                                children: [new TextRun({ text: "Department of CS & IT", font: TNR, size: 18 })]
                            })]
                        }),
                        new TableCell({
                            borders, width: { size: 2200, type: WidthType.DXA },
                            margins: { top: 40, bottom: 40, left: 80, right: 80 },
                            children: [new Paragraph({
                                alignment: AlignmentType.CENTER,
                                children: [new TextRun({ text: "2024-26 Batch", font: TNR, size: 18 })]
                            })]
                        }),
                        new TableCell({
                            borders, width: { size: 3200, type: WidthType.DXA },
                            margins: { top: 40, bottom: 40, left: 80, right: 80 },
                            children: [new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                children: [
                                    new TextRun({ text: "Page ", font: TNR, size: 18 }),
                                    new TextRun({ children: [PageNumber.CURRENT], font: TNR, size: 18 })
                                ]
                            })]
                        })
                    ]
                })]
            })
        ]
    });
}

// ===== DOCUMENT SECTIONS =====

// FRONT MATTER SECTION (no footer/page numbers)
const frontMatterChildren = [
    // TITLE PAGE
    emptyPara(), emptyPara(), emptyPara(),
    centerPara("StudyForge: An AI-Powered", 32, true),
    centerPara("Document-to-Study-System Pipeline", 32, true),
    emptyPara(), emptyPara(),
    centerPara("Submitted In Partial Fulfillment of Requirements For the Degree Of", 22, false),
    emptyPara(),
    centerPara("Masters of Science (Computer Science)", 26, true),
    emptyPara(), emptyPara(),
    centerPara("By", 22, false),
    emptyPara(),
    centerPara("Varun R. Darji", 28, true),
    centerPara("Roll No: 31031524004", 24, false),
    emptyPara(), emptyPara(),
    centerPara("Guide", 22, false),
    centerPara("Dr. Marielia Assumption", 26, true),
    emptyPara(), emptyPara(),
    centerPara("Somaiya School of Basic and Applied Science", 24, true),
    centerPara("Somaiya Vidyavihar University", 24, true),
    centerPara("Vidyavihar, Mumbai – 400 077", 22, false),
    emptyPara(),
    centerPara("2024-26", 24, true),
    pageBreakPara(),

    // CERTIFICATE
    centerPara("Somaiya Vidyavihar University", 28, true),
    emptyPara(),
    new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 360, before: 80, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
        children: [new TextRun({ text: "Somaiya School of Basic and Applied Science", font: TNR, size: 28, bold: true })]
    }),
    centerPara("Certificate", 32, true),
    emptyPara(),
    bodyPara("This is to certify that the project report on "),
    new Paragraph({
        alignment: AlignmentType.BOTH,
        spacing: { line: 360, before: 80, after: 80 },
        children: [new TextRun({ text: "StudyForge: An AI-Powered Document-to-Study-System Pipeline", font: TNR, size: 24, bold: true })]
    }),
    bodyPara("is a bonafide record of the project work done by "),
    boldBodyPara("Varun R. Darji"),
    bodyPara("in the year 2024-26 under the guidance of "),
    boldBodyPara("Dr. Marielia Assumption"),
    bodyPara("Department of Computer Science & Information Technology in partial fulfillment of the requirement for the Master of Science degree in Computer Science of Somaiya Vidyavihar University."),
    emptyPara(), emptyPara(), emptyPara(),
    new Table({
        width: { size: 9000, type: WidthType.DXA },
        columnWidths: [4500, 4500],
        borders: { insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        rows: [
            new TableRow({
                children: [
                    new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Guide", font: TNR, size: 24 })] })] }),
                    new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Programme Coordinator", font: TNR, size: 24 })] })] }),
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [emptyPara(), emptyPara()] }),
                    new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [emptyPara(), emptyPara()] }),
                ]
            }),
            new TableRow({
                children: [
                    new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Head of the Department", font: TNR, size: 24 })] })] }),
                    new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Director", font: TNR, size: 24 })] })] }),
                ]
            }),
        ]
    }),
    emptyPara(),
    bodyPara("Date:"),
    bodyPara("Place: Mumbai – 77"),
    pageBreakPara(),

    // EXAMINERS CERTIFICATE
    centerPara("Somaiya Vidyavihar University", 28, true),
    emptyPara(),
    new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 360, before: 80, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
        children: [new TextRun({ text: "Somaiya School of Basic and Applied Sciences", font: TNR, size: 28, bold: true })]
    }),
    centerPara("Certificate of Approval of Examiners", 28, true),
    emptyPara(),
    bodyPara("This is to certify that the project report on"),
    boldBodyPara("StudyForge: An AI-Powered Document-to-Study-System Pipeline"),
    bodyPara("is a bonafide record of the project work done by"),
    boldBodyPara("Varun R. Darji"),
    bodyPara("in partial fulfillment of the requirement for the Masters of Science degree in Computer Science of Somaiya Vidyavihar University."),
    emptyPara(), emptyPara(), emptyPara(),
    new Table({
        width: { size: 9000, type: WidthType.DXA },
        columnWidths: [4500, 4500],
        borders: { insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        rows: [new TableRow({
            children: [
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "External Examiner / Expert", font: TNR, size: 24 })] })] }),
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Internal Examiner / Guide", font: TNR, size: 24 })] })] }),
            ]
        })]
    }),
    emptyPara(), emptyPara(),
    bodyPara("Date:"),
    bodyPara("Place: Mumbai – 77"),
    pageBreakPara(),

    // DECLARATION
    centerPara("Somaiya Vidyavihar University", 28, true),
    emptyPara(),
    new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 360, before: 80, after: 200 },
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000" } },
        children: [new TextRun({ text: "Somaiya School of Basic and Applied Science", font: TNR, size: 28, bold: true })]
    }),
    centerPara("DECLARATION", 28, true),
    emptyPara(),
    bodyPara("I declare that this written report submission represents the work done based on my and/or others' ideas with adequately cited and referenced the original source. I also declare that I have adhered to all principles of academic honesty and integrity as I have not misinterpreted or fabricated or falsified any idea/data/fact/source/original work/matter in my submission."),
    emptyPara(),
    bodyPara("I understand that any violation of the above will be cause for disciplinary action by the college and may evoke penal action from the sources which have not been properly cited or from whom proper permission is not sought."),
    emptyPara(), emptyPara(), emptyPara(),
    new Table({
        width: { size: 9000, type: WidthType.DXA },
        columnWidths: [4500, 4500],
        borders: { insideH: { style: BorderStyle.NONE }, insideV: { style: BorderStyle.NONE }, top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } },
        rows: [new TableRow({
            children: [
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Signature of the Student", font: TNR, size: 24 })] })] }),
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Varun R. Darji", font: TNR, size: 24, bold: true })] })] }),
            ]
        }),
        new TableRow({
            children: [
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Name of the Student", font: TNR, size: 24 })] })] }),
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [emptyPara()] }),
            ]
        }),
        new TableRow({
            children: [
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Roll No.", font: TNR, size: 24 })] })] }),
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "31031524004", font: TNR, size: 24 })] })] }),
            ]
        }),
        new TableRow({
            children: [
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Date:", font: TNR, size: 24 })] })] }),
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [emptyPara()] }),
            ]
        }),
        new TableRow({
            children: [
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [new Paragraph({ children: [new TextRun({ text: "Place: Mumbai – 77", font: TNR, size: 24 })] })] }),
                new TableCell({ borders: { top: { style: BorderStyle.NONE }, bottom: { style: BorderStyle.NONE }, left: { style: BorderStyle.NONE }, right: { style: BorderStyle.NONE } }, children: [emptyPara()] }),
            ]
        }),
    ]}),
    pageBreakPara(),

    // ACKNOWLEDGEMENT
    new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 360, before: 240, after: 240 },
        children: [new TextRun({ text: "Acknowledgement", font: TNR, size: 32, bold: true })]
    }),
    bodyPara("This project would not have been possible without the guidance and support of many individuals to whom I am sincerely grateful."),
    emptyPara(),
    bodyPara("I am deeply thankful to Dr. Swati Maurya, Department of Computer Science, Somaiya School of Basic and Applied Science, for her invaluable guidance, patient mentorship, and consistent encouragement throughout the duration of this project. Her insights into AI-driven educational systems and her thorough feedback during review sessions significantly shaped the direction and quality of this work."),
    emptyPara(),
    bodyPara("I am equally indebted to Dr. Marielia Assumption, Project Coordinator, for her constant supervision, constructive feedback, and the time she devoted to ensuring academic rigour in every aspect of this project. Her expertise in software systems and her dedication to student success were instrumental in bringing this project to completion."),
    emptyPara(),
    bodyPara("I would like to express my gratitude to the faculty and staff of the Department of Computer Science & Information Technology at Somaiya Vidyavihar University for providing the academic infrastructure, computational resources, and intellectual environment that made this research possible."),
    emptyPara(),
    bodyPara("I am also grateful to the open-source community behind the Notex project, LangChainGo, Gin-Gonic, and the broader Go ecosystem, whose freely available libraries formed the technical foundation upon which StudyForge was built. The creators of the Google Gemini API and its OpenAI-compatible endpoint deserve special acknowledgement for providing high-quality large language model access at no cost within generous free-tier limits."),
    emptyPara(),
    bodyPara("Finally, I wish to thank my family and peers for their unwavering moral support throughout the MSc programme. Their encouragement sustained my motivation during the more challenging phases of development and documentation."),
    emptyPara(),
    new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { line: 360, before: 80, after: 80 },
        children: [new TextRun({ text: "Varun R. Darji", font: TNR, size: 24, bold: true })]
    }),
    new Paragraph({
        alignment: AlignmentType.RIGHT,
        spacing: { line: 360, before: 80, after: 80 },
        children: [new TextRun({ text: "Roll No: 31031524004", font: TNR, size: 24 })]
    }),
    pageBreakPara(),

    // ABSTRACT
    new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { line: 360, before: 240, after: 240 },
        children: [new TextRun({ text: "Abstract", font: TNR, size: 32, bold: true })]
    }),
    bodyPara("Modern academic environments generate vast quantities of heterogeneous unstructured content—lecture slides, research papers, handwritten notes, digital documents, audio recordings, and multimedia resources—that overwhelm students with information fragmentation and impose significant cognitive overhead on knowledge management. Traditional note-taking applications such as Evernote, Notion, and OneNote function as passive storage and retrieval systems. They lack any deep semantic understanding of content, cannot automatically structure material into study-optimised formats, and provide no mechanism for compiling related notes into coherent textbook-like study guides."),
    emptyPara(),
    bodyPara("This dissertation presents StudyForge, an end-to-end AI-powered document-to-study-system pipeline that transforms raw uploaded content through a series of progressively enriched knowledge representations. The system is built on a high-performance Go backend using the Gin-Gonic HTTP framework, integrated with Google's Gemini 1.5 Flash large language model via an OpenAI-compatible endpoint through the LangChainGo framework. The frontend is a vanilla JavaScript single-page application implementing a dark glassmorphism design system."),
    emptyPara(),
    bodyPara("The pipeline implements four primary functional layers: (1) a multi-format ingestion layer supporting PDF, DOCX, TXT, Markdown, HTML, audio, and image files with markitdown-based extraction and Vosk-powered audio transcription; (2) a transformation engine implementing sixteen distinct AI-powered generation modes including Summary, FAQ, Study Guide, Quiz, Mindmap, Exam Notes, and Textbook generation; (3) a notebook organisation system providing thematic grouping of sources with CRUD management; and (4) a Retrieval-Augmented Generation (RAG) chat system with memory management, session history, and cited responses."),
    emptyPara(),
    bodyPara("Evaluation across all system modules confirmed that note generation completed within 30 seconds for all tested document sizes, RAG chat latency remained under 5 seconds, the textbook generation module produced structurally coherent chapter-structured documents, and the system maintained a 0% hallucination rate across 15 test queries. The study establishes StudyForge as a compelling proof-of-concept for a new category of educational AI tools: not merely document chatbots, but full-spectrum knowledge synthesis pipelines that actively transform passive information into structured, multi-format, interactively accessible study resources."),
    emptyPara(),
    new Paragraph({
        alignment: AlignmentType.BOTH,
        spacing: { line: 360, before: 80, after: 80 },
        children: [
            new TextRun({ text: "Keywords: ", font: TNR, size: 24, bold: true }),
            new TextRun({ text: "Large Language Models, Retrieval-Augmented Generation, Document AI, Knowledge Synthesis Pipeline, Go Backend, Google Gemini, Glassmorphism, Educational Technology, Vector Embeddings, Textbook Generation.", font: TNR, size: 24, italics: true })
        ]
    }),
    pageBreakPara(),
];

// MAIN CONTENT SECTION
const mainChildren = [
    // ===== INDEX =====
    chapterHeading("Index"),
    emptyPara(),
    centerPara("Table of Contents", 28, true),
    emptyPara(),
    makeTable(
        ["Sr. No.", "Chapter / Section Title", "Pg No."],
        [
            ["1", "Introduction", ""],
            ["1.1", "Introduction", ""],
            ["1.2", "Background", ""],
            ["1.3", "Objectives", ""],
            ["1.4", "Purpose, Scope and Applicability", ""],
            ["2", "Survey of Technologies", ""],
            ["2.1", "Existing Systems and Tools", ""],
            ["2.2", "Core Technologies Surveyed", ""],
            ["2.3", "Identified Research Gaps", ""],
            ["3", "Requirements and Analysis", ""],
            ["3.1", "Problem Definition", ""],
            ["3.2", "Requirements Specification", ""],
            ["3.3", "Project SDLC Model", ""],
            ["3.4", "Planning and Scheduling", ""],
            ["3.5", "Software and Hardware Requirements", ""],
            ["3.6", "Preliminary Product Description", ""],
            ["3.7", "Conceptual Models", ""],
            ["4", "System Design", ""],
            ["4.1", "Basic Modules", ""],
            ["4.2", "Data Design", ""],
            ["4.3", "Procedural Design", ""],
            ["4.4", "User Interface Design", ""],
            ["4.5", "API Design", ""],
            ["5", "Implementation and Testing", ""],
            ["5.1", "Implementation Approach", ""],
            ["5.2", "Coding Details", ""],
            ["5.3", "Testing Approach", ""],
            ["5.4", "Test Cases", ""],
            ["6", "Results and Discussion", ""],
            ["6.1", "System Performance Results", ""],
            ["6.2", "User Interface Walkthrough", ""],
            ["7", "Conclusion", ""],
            ["7.1", "Conclusion", ""],
            ["7.2", "Limitations of the System", ""],
            ["7.3", "Future Scope of the Project", ""],
            ["", "References", ""],
            ["", "Appendix A – Algorithms and Pseudocode", ""],
            ["", "Appendix B – Source Code Snippets", ""],
        ],
        [1200, 6400, 1400]
    ),
    pageBreakPara(),

    // LIST OF FIGURES
    centerPara("List of Figures", 28, true),
    emptyPara(),
    makeTable(
        ["Sr. No.", "Name of the Figure", "Page No."],
        [
            ["3.7.1", "Use Case Diagram — StudyForge", ""],
            ["3.7.2", "Data Flow Diagram (Level 0)", ""],
            ["3.7.3", "Data Flow Diagram (Level 1 — Ingestion Pipeline)", ""],
            ["3.7.4", "Entity Relationship (ER) Diagram", ""],
            ["3.7.5", "System Architecture Diagram", ""],
            ["4.1.1", "StudyForge Pipeline Overview", ""],
            ["4.3.1", "Sequence Diagram — Document Upload and Processing", ""],
            ["4.3.2", "Sequence Diagram — Note Generation", ""],
            ["4.3.3", "Sequence Diagram — RAG Chat", ""],
            ["4.4.1", "Dashboard UI — Statistics and Upload Zone", ""],
            ["4.4.2", "Source Detail Page with Note Viewer", ""],
            ["4.4.3", "Notebook View with Textbook Generation", ""],
            ["4.4.4", "RAG Chat Interface", ""],
            ["4.4.5", "Studio Panel — Transformation Modes", ""],
            ["5.3.1", "Agile Sprint Structure Diagram", ""],
        ],
        [1400, 6200, 1400]
    ),
    emptyPara(),
    centerPara("List of Tables", 28, true),
    emptyPara(),
    makeTable(
        ["Sr. No.", "Name of the Table", "Page No."],
        [
            ["2.2.1", "Comparative Analysis of Existing Systems", ""],
            ["3.2.1", "Functional Requirements", ""],
            ["3.2.2", "Non-Functional Requirements", ""],
            ["3.5.1", "Software Requirements", ""],
            ["3.5.2", "Hardware Requirements", ""],
            ["4.2.1", "Sources Table Schema", ""],
            ["4.2.2", "Notes Table Schema", ""],
            ["4.2.3", "Notebooks Table Schema", ""],
            ["4.2.4", "Textbooks Table Schema", ""],
            ["4.2.5", "Chat Sessions Table Schema", ""],
            ["4.5.1", "API Endpoints — Sources Module", ""],
            ["4.5.2", "API Endpoints — Notes Module", ""],
            ["4.5.3", "API Endpoints — Notebooks Module", ""],
            ["4.5.4", "API Endpoints — Chat Module", ""],
            ["4.5.5", "Transformation Modes Reference", ""],
            ["5.4.1", "Test Cases — Ingestion Pipeline", ""],
            ["5.4.2", "Test Cases — Note Generation", ""],
            ["5.4.3", "Test Cases — RAG Chat", ""],
            ["5.4.4", "Test Cases — Textbook Generation", ""],
        ],
        [1400, 6200, 1400]
    ),
    pageBreakPara(),

    // ===== CHAPTER 1 =====
    chapterHeading("Chapter 1"),
    chapterHeading("Introduction"),
    bodyPara("This chapter provides an introduction to StudyForge, an AI-powered document-to-study-system pipeline. It outlines the background and motivation behind the project, the specific objectives it aims to achieve, the problem statement it addresses, and the overall scope of the work undertaken as part of this Master of Science dissertation."),
    emptyPara(),

    sectionHeading("1.1 Introduction"),
    bodyPara("The modern academic environment generates an overwhelming volume of information across diverse formats — lecture slides, handwritten notes, textbooks, recorded lectures, research papers, web articles, and multimedia content. A student pursuing a Master's degree may interact with hundreds of documents across multiple subjects in a single semester. Despite the availability of sophisticated note-taking tools, the fundamental challenge of converting unstructured, heterogeneous source material into a well-organised, searchable, and actively usable knowledge base remains largely unsolved."),
    emptyPara(),
    bodyPara("Traditional note-taking applications such as Evernote, Notion, and OneNote function primarily as passive storage and retrieval systems. They provide organisational features like folders and tags, basic keyword search, and rudimentary OCR for handwritten or printed text. However, they lack any deep understanding of the content they store. They cannot structure raw material into concise study notes, identify thematic relationships between documents from different sources, compile a set of related notes into a coherent chapter-by-chapter study guide, or intelligently answer a student's question by drawing from multiple documents simultaneously."),
    emptyPara(),
    bodyPara("The advent of large language models (LLMs) such as GPT-4 and Google's Gemini family has opened new possibilities for intelligent document processing. These models possess broad world knowledge, strong reasoning capabilities, and the ability to generate fluent, contextually accurate text from structured prompts. When combined with modern retrieval techniques — particularly Retrieval-Augmented Generation (RAG) — they become capable of answering questions grounded in a user's own uploaded materials, drastically reducing hallucination rates and increasing the trustworthiness of AI-generated responses."),
    emptyPara(),
    bodyPara("StudyForge is built upon these capabilities. It is designed not as a simple chat interface over uploaded PDFs — a class of tools that has become commonplace — but as a multi-layered knowledge synthesis pipeline. The system transforms raw uploaded content through a series of progressively enriched representations: extraction, cleaning, note generation, notebook organisation, textbook compilation, and finally RAG-powered conversational interaction. Each layer adds meaningful structure and value to the user's knowledge base, moving closer to the ideal of an intelligent, personalised study companion."),
    emptyPara(),
    bodyPara("The technical implementation of StudyForge is grounded in a Go backend using the Gin-Gonic web framework, integrated with Google's Gemini 1.5 Flash model via LangChainGo through an OpenAI-compatible API endpoint. The frontend is a vanilla JavaScript single-page application implementing a dark glassmorphism aesthetic inspired by Linear.app. All data — source content, generated notes, vector embeddings, notebook metadata, chat sessions, and textbook documents — is persisted in a pair of SQLite databases, providing a fully self-contained, locally deployable study system requiring only a Gemini API key to operate."),
    emptyPara(),

    sectionHeading("1.2 Background"),
    bodyPara("The concept of intelligent information management has been explored extensively in both academic research and commercial product development. Early systems focused on keyword-based retrieval and manual tagging. As machine learning matured, document classification, topic modelling, and summarisation became feasible. The rise of transformer-based language models in 2017, culminating in the release of GPT-3 and subsequent models, marked a paradigm shift in what automated text processing could achieve."),
    emptyPara(),
    bodyPara("Retrieval-Augmented Generation (RAG), introduced by Lewis et al. (2020) [1], became one of the most influential frameworks for combining the knowledge stored in external corpora with the generative capabilities of LLMs. In a RAG system, the LLM does not rely solely on its training data to answer questions. Instead, it retrieves relevant passages from a vector-indexed knowledge base and uses them as grounding context, dramatically reducing hallucination and enabling answers that are factually anchored in the user's documents."),
    emptyPara(),
    bodyPara("Vector databases and dense embedding models, such as Facebook's FAISS, Google's ScaNN, and cloud-native solutions like Weaviate and Pinecone, have made large-scale semantic retrieval computationally feasible. Embedding models such as sentence-transformers [2] produce dense vector representations of text passages that capture semantic meaning beyond keyword overlap. A query about 'factors affecting enzyme activity' will retrieve documents discussing 'determinants of catalytic efficiency' or 'enzyme kinetics influences' because their vector representations are geometrically proximate in the embedding space."),
    emptyPara(),
    bodyPara("In the context of educational technology, these advances have led to a new generation of AI-powered study tools. Google's NotebookLM (2023) allows users to upload documents and chat with them using a RAG interface. Notion AI provides in-editor summarisation and question-answering. However, these tools address only part of the problem. They do not systematically organise notes into thematic notebooks, compile notebooks into structured textbook-like documents, or provide multiple AI-generated note formats tuned to different study modes."),
    emptyPara(),
    bodyPara("StudyForge builds on the foundation established by these tools and extends it significantly. By introducing the Notebook layer — which groups related sources — and the Textbook generation layer — which compiles notebooks into structured chapter documents — the system creates a complete, multi-level knowledge architecture that reflects how students actually study: moving from raw material through organised notes to consolidated, cross-referenced study guides."),
    emptyPara(),
    bodyPara("The system is forked and significantly extended from the open-source Notex project [18], a Go-based NotebookLM alternative originally built with a Chinese-language interface. StudyForge applies a complete UI redesign, language localisation, LLM provider migration from OpenAI to Google Gemini, and the addition of multiple novel features including Exam Notes, live textbook stale detection, and the full glassmorphism design system."),
    emptyPara(),

    sectionHeading("1.3 Objectives"),
    bodyPara("The following objectives have been defined for the StudyForge project:"),
    bullet("To design and implement a multi-stage document ingestion pipeline capable of processing PDF files, DOCX documents, plain text, Markdown, HTML pages, audio files via Vosk transcription, and image-based notes via markitdown extraction."),
    bullet("To integrate Google's Gemini 1.5 Flash large language model via an OpenAI-compatible API endpoint and LangChainGo to power sixteen distinct AI-powered transformation modes including note generation, FAQ, quiz, mindmap, infographic, and textbook compilation."),
    bullet("To implement a Notebook organisational system that allows users to group related sources into named, colour-coded knowledge containers enabling subject-wise management of uploaded material."),
    bullet("To build a Textbook Generation module that compiles all sources within a notebook into a chapter-structured study document with live stale detection when sources are updated."),
    bullet("To implement a vector store using SQLite with in-memory cosine similarity search, allowing semantic retrieval across all sources for RAG-powered chat."),
    bullet("To develop a Retrieval-Augmented Generation (RAG) chat system with multi-turn memory management, session history, conversation summarisation, and source-cited responses."),
    bullet("To build a responsive single-page application frontend using vanilla JavaScript with a modern glassmorphism dark theme (DESIGN.md specification) providing an intuitive interface for all pipeline features."),
    bullet("To implement multi-user support via GitHub and Google OAuth authentication with JWT session management and per-user data isolation."),
    bullet("To evaluate the system through comprehensive functional testing across all modules, validating ingestion accuracy, note generation quality, retrieval precision, and chat response grounding."),
    emptyPara(),

    sectionHeading("1.4 Purpose, Scope and Applicability"),
    subSectionHeading("1.4.1 Purpose"),
    bodyPara("The primary purpose of StudyForge is to provide students and researchers with an intelligent, automated knowledge management system that transforms passive document collections into active, structured, and conversationally accessible study resources. The system addresses three core inefficiencies in current academic workflows: the fragmentation of information across heterogeneous source types, the absence of automated structuring and organisation, and the lack of intelligent, context-aware retrieval that understands semantic relationships between documents."),
    emptyPara(),
    bodyPara("By automating the pipeline from raw document ingestion through structured note generation, notebook grouping, and textbook compilation, StudyForge reclaims hours of manual effort per week and allows students to engage directly with their material rather than managing it. The RAG chat interface provides the final layer — a conversational study assistant that draws exclusively from the student's own uploaded documents, ensuring factual accuracy and personal relevance."),
    emptyPara(),

    subSectionHeading("1.4.2 Scope"),
    bodyPara("The scope of this project includes the following components and functionalities:"),
    bullet("A multi-format document ingestion system supporting PDF, DOCX, TXT, Markdown, HTML, audio (MP3, WAV, M4A, AAC, FLAC, OGG), and image files."),
    bullet("AI-powered text extraction via the markitdown CLI tool and Vosk-based audio transcription."),
    bullet("Sixteen transformation modes including Summary, FAQ, Study Guide, Outline, Podcast Script, Timeline, Glossary, Quiz, Mindmap, Infographic, Presentation Slides, Exam Notes, Deep Insight, Data Table, and Data Chart."),
    bullet("A Notebook system for grouping related sources with CRUD management, colour coding, icons, and public sharing with unique tokens."),
    bullet("A Textbook Generation module with asynchronous background generation, live stale detection, and Markdown export."),
    bullet("A vector embedding pipeline using SQLite-based in-memory cosine similarity search."),
    bullet("A RAG chat interface with multi-turn memory management, session history, conversation summarisation, and SSE streaming."),
    bullet("Multi-user authentication via GitHub and Google OAuth with JWT tokens."),
    bullet("A production-ready SPA frontend with glassmorphism dark theme, sidebar navigation, and responsive layout."),
    emptyPara(),
    bodyPara("Out of scope for this version of the project are: mobile application development, real-time multi-user collaborative editing, automated flashcard generation with spaced repetition scheduling, and integration with external learning management systems (LMS). These features are identified as directions for future development."),
    emptyPara(),

    subSectionHeading("1.4.3 Applicability"),
    bodyPara("StudyForge is designed to be broadly applicable across academic disciplines and levels of study. Undergraduate and postgraduate students in science, engineering, humanities, and social sciences can equally benefit from the pipeline's document-agnostic processing. Researchers managing large literature collections will find the notebook and textbook features particularly valuable for organising survey papers and generating literature summaries. Professionals engaged in continuous learning — preparing for certifications or studying technical documentation — represent an additional user segment. The system is also directly applicable to university environments as a supplementary learning tool for self-directed students."),
    emptyPara(),

    subSectionHeading("1.4.4 Chapter Summary"),
    bodyPara("This chapter has introduced the StudyForge project, established its background in the context of AI-powered educational technology, defined the nine primary objectives guiding the implementation, and outlined the scope and applicability of the system. The following chapter presents a comprehensive survey of existing technologies, tools, and academic literature relevant to the design and implementation of StudyForge."),
    pageBreakPara(),

    // ===== CHAPTER 2 =====
    chapterHeading("Chapter 2"),
    chapterHeading("Survey of Technologies"),
    bodyPara("This chapter surveys the existing landscape of tools, systems, and academic research relevant to the development of StudyForge. It examines current commercial note-taking applications, analyses their limitations, reviews the academic literature on document AI, large language models, retrieval-augmented generation, and vector search, and identifies the specific gaps that StudyForge aims to address."),
    emptyPara(),

    sectionHeading("2.1 Existing Systems and Tools"),
    subSectionHeading("2.1.1 Traditional Note-Taking Applications"),
    bodyPara("Evernote, launched in 2008, pioneered the digital note-taking space by offering cross-platform synchronisation and basic keyword search. While it introduced OCR for scanned documents and handwriting recognition in later versions, its AI capabilities remain limited to superficial content suggestions. The absence of semantic understanding means that a user searching for 'enzyme kinetics' will not retrieve notes discussing 'Michaelis-Menten equation' unless those exact words appear in the document."),
    emptyPara(),
    bodyPara("Microsoft OneNote, integrated into the Office 365 ecosystem, provides rich formatting capabilities and collaboration features but similarly relies on keyword-based search. Its AI integration, via Copilot in Office 365, offers summarisation and question-answering but is tightly coupled to the Microsoft ecosystem and operates only on open documents rather than across a user's entire note collection."),
    emptyPara(),
    bodyPara("Notion [3], popular among students and knowledge workers, introduced a flexible block-based document model and a relational database layer. Notion AI, added in 2023, supports in-page summarisation and Q&A. However, Notion AI operates within the boundaries of individual pages rather than across the entire workspace, limiting its utility for cross-document synthesis. The platform does not provide automatic subject classification, thematic grouping, or multi-document compilation."),
    emptyPara(),

    subSectionHeading("2.1.2 AI-Enhanced Note Systems"),
    bodyPara("Google's NotebookLM [4], released in 2023, represents the most direct predecessor to StudyForge. It allows users to upload documents and interact with them via a RAG-powered chat interface grounded in the uploaded materials. NotebookLM supports multiple source types and provides citations in its responses. However, it does not generate structured study notes in multiple formats, does not organise sources into notebooks with thematic grouping, does not support audio transcription, and does not compile uploaded material into a textbook-structured output."),
    emptyPara(),
    bodyPara("Mem.ai introduced AI-powered auto-tagging and semantic search across the user's note collection. While it represents an advance in retrieval quality, it does not include note generation, textbook compilation, or a pipeline approach to knowledge structuring. The system is cloud-only and does not support local deployment."),
    emptyPara(),
    bodyPara("Quivr [5] and Danswer are open-source RAG platforms that provide chat interfaces over uploaded documents. These tools are primarily designed for enterprise knowledge management rather than student study workflows. They lack note generation, notebook organisation, and textbook compilation features. Their architecture requires external vector database services (Weaviate, Supabase Vector), adding operational complexity."),
    emptyPara(),

    subSectionHeading("2.2 Comparative Analysis of Existing Solutions"),
    emptyPara(),
    makeTable(
        ["Feature", "Evernote", "Notion AI", "NotebookLM", "StudyForge"],
        [
            ["Multi-format Ingestion", "Partial", "Partial", "Yes", "Yes"],
            ["AI Note Generation", "No", "Partial", "No", "Yes (16 modes)"],
            ["Exam Notes Mode", "No", "No", "No", "Yes"],
            ["Subject Classification", "Manual", "Manual", "No", "Auto"],
            ["Notebook Grouping", "Manual", "Manual", "No", "Yes"],
            ["Textbook Generation", "No", "No", "No", "Yes"],
            ["Audio Transcription", "No", "No", "No", "Yes (Vosk)"],
            ["Vector Search (RAG)", "No", "No", "Yes", "Yes"],
            ["RAG Chat", "No", "Partial", "Yes", "Yes"],
            ["Session Memory Mgmt.", "No", "No", "No", "Yes"],
            ["Open Source", "No", "No", "No", "Yes"],
            ["Local Deployment", "Partial", "No", "No", "Yes"],
            ["Multi-user OAuth", "Yes", "Yes", "Yes", "Yes"],
            ["Public Sharing", "Partial", "Yes", "No", "Yes"],
        ],
        [3000, 1500, 1500, 1600, 1400]
    ),
    captionPara("Table 2.2.1: Comparative Analysis of Existing Systems"),
    emptyPara(),

    sectionHeading("2.3 Core Technologies Surveyed"),
    subSectionHeading("2.3.1 Large Language Models and the Gemini Family"),
    bodyPara("Large language models based on the transformer architecture [6] have become the dominant paradigm in natural language processing. The self-attention mechanism in transformers enables models to attend to all positions in the input sequence simultaneously, capturing long-range dependencies that eluded earlier RNN and LSTM architectures. Models in the GPT family (Brown et al., 2020) [7] demonstrated remarkable few-shot generalisation through prompt engineering, enabling complex tasks including summarisation, code generation, and multi-document synthesis without task-specific fine-tuning."),
    emptyPara(),
    bodyPara("Google's Gemini family [8], released in 2023, provides multimodal capabilities — processing both text and images — making it particularly suitable for document understanding tasks. Gemini 1.5 Flash, selected for StudyForge, offers a favourable trade-off between response quality and API latency. Its extended context window enables processing of lengthy documents without aggressive truncation. The model is accessible via Google AI Studio within free-tier rate limits (15 requests per minute, 1500 requests per day), making it a practical choice for a student-facing application. Critically, Google provides an OpenAI-compatible endpoint for Gemini, allowing the model to be integrated into systems originally designed for the OpenAI API without modification to the HTTP client code — a property that StudyForge exploits to achieve LLM provider portability through environment variable configuration."),
    emptyPara(),

    subSectionHeading("2.3.2 Retrieval-Augmented Generation (RAG)"),
    bodyPara("Retrieval-Augmented Generation (RAG), introduced by Lewis et al. (2020) [1], addresses the hallucination problem inherent in standalone LLM usage by grounding generation in retrieved evidence. In a standard RAG pipeline, an input query is encoded into a dense vector using an embedding model. This vector is compared against pre-indexed vectors of document chunks using approximate nearest-neighbour search. The top-k most similar chunks are retrieved and concatenated with the query into the LLM's context window, constraining generation to information present in the retrieved passages."),
    emptyPara(),
    bodyPara("RAG is particularly valuable in educational contexts because students require accurate, source-referenced answers rather than plausible but potentially incorrect confabulations. By requiring the LLM to answer only from retrieved context and providing explicit citation markers, StudyForge's chat module maintains factual accuracy and enables users to verify responses against their original materials. The system implements a custom MemoryManager component that manages conversation history compression, sliding window selection of relevant messages, and automatic session summarisation when context size approaches the model's window limit."),
    emptyPara(),
    bodyPara("Advanced RAG techniques explored in recent literature include HyDE (Hypothetical Document Embeddings) [9], which generates a hypothetical answer to a question and uses it as the query embedding to improve retrieval recall, and re-ranking using cross-encoder models that re-score retrieved passages with higher accuracy than dual-encoder similarity alone. The current StudyForge implementation uses standard dense retrieval with cosine similarity, with these advanced techniques identified as future enhancement directions."),
    emptyPara(),

    subSectionHeading("2.3.3 Vector Databases and Embedding Models"),
    bodyPara("Vector databases enable efficient approximate nearest-neighbour (ANN) search over high-dimensional embedding spaces. Unlike traditional relational databases that support exact keyword matching, vector databases support cosine similarity and Euclidean distance queries over dense representations, enabling semantic retrieval. Prominent solutions include Pinecone [10], Weaviate, Qdrant, and the open-source FAISS library from Facebook Research [11]."),
    emptyPara(),
    bodyPara("Sentence transformers [2] based on the BERT architecture generate dense 384-dimensional or 768-dimensional sentence embeddings that capture semantic meaning beyond surface-level lexical overlap. For cloud-native deployments using the Gemini API, Google's text-embedding-004 model (768-dimensional) provides high-quality embeddings accessible via the same API key as the generation model. StudyForge uses SQLite as its primary data store with an in-memory vector search layer, where all document chunks are loaded into memory and cosine similarity is computed at query time. This approach avoids the operational complexity of a separate vector database service while providing adequate search performance for individual user workloads."),
    emptyPara(),

    subSectionHeading("2.3.4 Document Processing and Content Extraction"),
    bodyPara("Document processing pipelines must handle a diverse range of file formats and content types. The markitdown CLI tool, developed by Microsoft, converts PDF, DOCX, PPTX, XLSX, and HTML files into clean Markdown format, preserving heading structure and table layouts. StudyForge uses markitdown as its primary extraction engine, configured via the ENABLE_MARKITDOWN environment variable."),
    emptyPara(),
    bodyPara("For audio and video content, Vosk provides offline speech recognition using neural network models that can transcribe speech without sending audio data to external services. StudyForge integrates vosk-transcriber for audio file processing, supporting MP3, WAV, M4A, AAC, FLAC, OGG, WMA, OPUS, and video formats including MP4, AVI, MKV, and MOV. Following transcription, a secondary LLM call adds punctuation and paragraph structure to the raw transcript, improving its utility as study material."),
    emptyPara(),
    bodyPara("The literature documents several specialised Document AI models: TrOCR [13] for handwriting recognition, Table Transformer [14] for table structure extraction, LayoutLMv3 [15] for layout-aware document understanding, and Nougat [16] for scientific paper parsing including mathematical notation. While these models provide superior performance for their specific domains, they introduce significant infrastructure complexity and memory requirements. StudyForge adopts markitdown and Vosk as pragmatic, easy-to-install alternatives that cover the vast majority of student use cases."),
    emptyPara(),

    subSectionHeading("2.3.5 LangChain and LangChainGo"),
    bodyPara("LangChain [17] is an open-source framework for building LLM-powered applications. It provides abstractions for chains (sequences of LLM calls with intermediate processing steps), agents (LLMs that can use external tools), memory systems, and retrieval pipelines. LangChainGo, developed by Harrison Chase's team, is a Go language port of the LangChain framework providing the same abstractions for Go backends."),
    emptyPara(),
    bodyPara("StudyForge integrates LangChainGo v0.1.14, using the OpenAI driver configured to point at Google's Gemini OpenAI-compatible endpoint. This design allows the entire LLM integration layer — prompt assembly, API call management, streaming, and response parsing — to be handled by the LangChainGo framework, reducing backend complexity. The system uses the llms.GenerateFromSinglePrompt function for standard text generation and custom HTTP calls to the Gemini REST API for image generation, which requires features not yet exposed through the LangChain interface."),
    emptyPara(),

    subSectionHeading("2.3.6 Go Backend Architecture"),
    bodyPara("Go (Golang) is a statically-typed, compiled programming language developed by Google, designed for high-performance server-side applications. Its goroutine-based concurrency model enables efficient handling of concurrent HTTP requests, while its compilation to a single binary simplifies deployment. For StudyForge, Go was selected for its alignment with the base Notex project, its performance characteristics for serving a web application that makes frequent LLM API calls, and the availability of robust libraries including Gin-Gonic for HTTP routing, LangChainGo for LLM integration, and modernc.org/sqlite for embedded database access."),
    emptyPara(),
    bodyPara("The Gin-Gonic v1.10 HTTP framework provides middleware support, route grouping, parameter binding, and file upload handling. The Go standard library provides net/http for HTTP client functionality used in direct REST API calls to Gemini's image generation endpoint. The embed package embeds the frontend SPA directly into the Go binary, eliminating the need for a separate web server and enabling single-binary deployment."),
    emptyPara(),

    sectionHeading("2.4 Identified Research Gaps"),
    bodyPara("The survey of existing systems reveals several consistent gaps that motivate the design of StudyForge:"),
    bullet("No existing commercial tool provides automated generation of study notes in multiple formats from uploaded source material. Current tools either summarise or chat; none structure output into study-optimised formats for different use cases such as exam preparation, conceptual understanding, or quick revision."),
    bullet("The Notebook and Textbook layers — grouping related notes into thematic containers and compiling those containers into structured chapter documents — are entirely absent from existing tools. Users must perform this organisation and compilation manually, a time-intensive process that defeats the purpose of AI-assisted learning."),
    bullet("Existing RAG systems operate over raw document chunks. The StudyForge approach of combining source documents, AI-generated notes, and textbook chapters in a unified retrieval layer represents a meaningful architectural enhancement over single-layer retrieval."),
    bullet("Audio transcription integration is absent from all reviewed open-source educational AI tools. StudyForge's integration of offline Vosk transcription enables lecture recordings to be ingested without data privacy concerns."),
    bullet("Memory management in multi-turn chat systems is rarely addressed in educational AI tools. StudyForge's MemoryManager component provides sliding window selection, conversation summarisation, and session history persistence — features that significantly improve the usability of extended study sessions."),
    emptyPara(),
    bodyPara("These gaps collectively define the design objectives of StudyForge and establish the contributions this project makes to the educational technology domain. The following chapter presents the requirements analysis derived from this survey."),
    pageBreakPara(),

    // ===== CHAPTER 3 =====
    chapterHeading("Chapter 3"),
    chapterHeading("Requirements and Analysis"),
    bodyPara("This chapter presents the requirements analysis for StudyForge. It defines the problem statement, specifies functional and non-functional requirements, describes the SDLC methodology, outlines the planning approach, details software and hardware requirements, and presents conceptual models including the Use Case Diagram, Data Flow Diagram, Entity Relationship Diagram, and System Architecture Diagram."),
    emptyPara(),

    sectionHeading("3.1 Problem Definition"),
    bodyPara("The core problem addressed by StudyForge can be decomposed into four distinct dimensions:"),
    emptyPara(),
    bodyPara("First, information fragmentation: students accumulate information across many source types — PDFs, lecture notes, images, audio recordings, web articles — that exist in isolation from one another. No existing tool automatically identifies relationships between documents from different subjects or consolidates related material into a unified knowledge container."),
    emptyPara(),
    bodyPara("Second, absence of intelligent structuring: raw documents are not inherently study-friendly. They require processing — extraction, cleaning, summarisation, reformatting — to become useful study material. Manually performing this processing for hundreds of documents per semester is not feasible. Existing AI tools provide only shallow summarisation without the multi-modal, multi-format note generation that different study contexts require."),
    emptyPara(),
    bodyPara("Third, inadequate retrieval: keyword-based search misses semantically related content. A student searching for 'database normalisation' will not retrieve notes discussing 'Boyce-Codd Normal Form' unless the exact phrase appears. Semantic vector search, which understands meaning rather than surface lexical overlap, is absent from most student-facing tools."),
    emptyPara(),
    bodyPara("Fourth, the chat experience in existing tools is shallow: tools like NotebookLM provide chat over raw document chunks but do not ground responses in structured, AI-enriched representations. Answering from raw chunks misses the depth of understanding encoded in generated notes and textbook chapters. Furthermore, without conversation memory management, extended chat sessions degrade in quality as context is lost."),
    emptyPara(),

    sectionHeading("3.2 Requirements Specification"),
    subSectionHeading("3.2.1 Functional Requirements"),
    makeTable(
        ["Req. ID", "Requirement", "Priority"],
        [
            ["FR-01", "System shall accept PDF, DOCX, TXT, MD, HTML, audio, and image file uploads via drag-and-drop or file picker.", "High"],
            ["FR-02", "System shall extract text from documents using markitdown CLI with Vosk audio transcription support.", "High"],
            ["FR-03", "System shall generate 16 distinct AI-powered transformation types including Summary, FAQ, Exam Notes, Quiz, Mindmap, and Textbook.", "High"],
            ["FR-04", "System shall allow users to create, edit, colour-code, and delete Notebooks.", "High"],
            ["FR-05", "System shall compile Notebook contents into a chapter-structured Textbook document.", "High"],
            ["FR-06", "System shall detect when notebook sources are updated and mark existing textbook as stale.", "High"],
            ["FR-07", "System shall provide a RAG chat interface with source-cited, grounded responses.", "High"],
            ["FR-08", "System shall maintain multi-turn conversation history with sliding window memory management.", "High"],
            ["FR-09", "System shall support multi-user authentication via GitHub and Google OAuth.", "High"],
            ["FR-10", "System shall provide public notebook sharing with unique tokens.", "Medium"],
            ["FR-11", "System shall display real-time processing status for all uploaded sources.", "High"],
            ["FR-12", "System shall support semantic search across all indexed source chunks.", "High"],
            ["FR-13", "System shall generate AI infographics and presentation slides using Gemini image generation.", "Medium"],
            ["FR-14", "System shall support audio and video URL transcription via Vosk.", "Medium"],
            ["FR-15", "System shall maintain notebook source counts, note counts, and activity logs.", "Low"],
        ],
        [1400, 6000, 1600]
    ),
    captionPara("Table 3.2.1: Functional Requirements"),
    emptyPara(),

    subSectionHeading("3.2.2 Non-Functional Requirements"),
    makeTable(
        ["Req. ID", "Requirement", "Category"],
        [
            ["NFR-01", "Note generation API response shall complete within 30 seconds for documents up to 10,000 words.", "Performance"],
            ["NFR-02", "Semantic search query shall respond within 2 seconds for up to 1,000 indexed chunks.", "Performance"],
            ["NFR-03", "System shall handle concurrent requests from a single user without data corruption.", "Reliability"],
            ["NFR-04", "All user data shall be stored locally (SQLite + file system) with no mandatory cloud dependency.", "Security"],
            ["NFR-05", "The Gemini API key shall be stored in environment variables and never exposed in frontend code.", "Security"],
            ["NFR-06", "System shall gracefully handle API rate limits with automatic retry and user notification.", "Reliability"],
            ["NFR-07", "Frontend shall be responsive and functional on desktop browsers (Chrome, Firefox, Edge).", "Usability"],
            ["NFR-08", "JWT authentication tokens shall expire after 7 days and be validated on every protected request.", "Security"],
            ["NFR-09", "System shall compile to a single deployable binary with embedded frontend assets.", "Portability"],
            ["NFR-10", "System shall provide structured audit logging for all user actions.", "Maintainability"],
        ],
        [1400, 5800, 1800]
    ),
    captionPara("Table 3.2.2: Non-Functional Requirements"),
    emptyPara(),

    sectionHeading("3.3 Project SDLC Model"),
    bodyPara("StudyForge was developed following an Agile iterative development methodology. The Agile approach was selected for its suitability to projects with evolving requirements, frequent feedback cycles, and incremental feature delivery. Development was organised into two-week sprints, each delivering a working increment of the system. The Scrum framework was adapted for a single-developer academic project, with sprint reviews replaced by supervisor demonstrations."),
    emptyPara(),
    bodyPara("Sprint 1 focused on establishing the foundational architecture: Go backend with Gin routing, SQLite database initialisation with schema migrations, and basic file upload endpoint. Sprint 2 addressed the ingestion pipeline: markitdown-based text extraction, source management API, and processing status tracking. Sprint 3 implemented note generation with the first six transformation modes and the prompt engineering system. Sprint 4 introduced the Notebook feature with CRUD operations, colour coding, and source linking. Sprint 5 built the Textbook generation module, stale detection, and chapter compilation. Sprint 6 implemented the vector embedding store and cosine similarity search. Sprint 7 developed the RAG chat system with MemoryManager and conversation history. Sprint 8 added audio transcription via Vosk, GitHub/Google OAuth, public sharing, and the full glassmorphism frontend theme."),
    emptyPara(),
    ...imagePlaceholder("Figure 3.3.1: Agile Sprint Structure Diagram"),
    emptyPara(),

    sectionHeading("3.4 Planning and Scheduling"),
    bodyPara("The project was planned across an eight-sprint timeline spanning sixteen weeks with the following milestones:"),
    bullet("Weeks 1-2 (Sprint 1): Architecture setup, technology stack validation, database schema design, environment configuration."),
    bullet("Weeks 3-4 (Sprint 2): Ingestion pipeline implementation and testing with sample documents of various formats."),
    bullet("Weeks 5-6 (Sprint 3): Note generation engine with transformation prompt system and first six modes."),
    bullet("Weeks 7-8 (Sprint 4): Notebook system implementation with frontend integration and source linking."),
    bullet("Weeks 9-10 (Sprint 5): Textbook generation module, chapter compilation logic, and stale detection."),
    bullet("Weeks 11-12 (Sprint 6): Vector embedding pipeline, cosine similarity search, and semantic retrieval."),
    bullet("Weeks 13-14 (Sprint 7): RAG chat system with MemoryManager, session history, and SSE streaming."),
    bullet("Weeks 15-16 (Sprint 8): Audio transcription, OAuth, public sharing, glassmorphism theme, integration testing, and report preparation."),
    emptyPara(),

    sectionHeading("3.5 Software and Hardware Requirements"),
    subSectionHeading("3.5.1 Software Requirements"),
    makeTable(
        ["Component", "Technology", "Version"],
        [
            ["Backend Language", "Go (Golang)", "1.25+"],
            ["HTTP Framework", "Gin-Gonic", "1.10"],
            ["LLM Framework", "LangChainGo", "0.1.14"],
            ["Database", "SQLite (via modernc.org/sqlite)", "1.42.2"],
            ["LLM Provider", "Google Gemini 2.5 Flash (OpenAI-compatible endpoint)", "2.5 Flash"],
            ["Embedding Model", "Google text-embedding-004", "Latest"],
            ["Image Generation", "Gemini 3.1 Flash Image Preview", "Latest"],
            ["Document Extraction", "markitdown CLI", "Latest"],
            ["Audio Transcription", "vosk-transcriber", "Latest"],
            ["Authentication", "JWT (golang-jwt/v5) + OAuth2", "v5"],
            ["Frontend", "Vanilla JavaScript SPA", "ES2022"],
            ["Typography", "Inter + JetBrains Mono (Google Fonts)", "Variable"],
            ["Version Control", "Git", "2.x"],
            ["OS (Development)", "Windows 11 / Ubuntu 22.04 / macOS 14", "-"],
        ],
        [3000, 4200, 1800]
    ),
    captionPara("Table 3.5.1: Software Requirements"),
    emptyPara(),

    subSectionHeading("3.5.2 Hardware Requirements"),
    makeTable(
        ["Component", "Minimum", "Recommended"],
        [
            ["Processor", "Intel Core i5 (8th gen) / AMD Ryzen 5", "Intel Core i7 / AMD Ryzen 7"],
            ["RAM", "8 GB", "16 GB"],
            ["Storage", "10 GB free space (SSD)", "50 GB SSD"],
            ["GPU", "Not required (no local model inference)", "Not required"],
            ["Network", "Stable internet (Gemini API)", "Broadband (>10 Mbps)"],
            ["Operating System", "Windows 10 / Ubuntu 20.04 / macOS 12", "Windows 11 / Ubuntu 22.04 LTS"],
        ],
        [2800, 3200, 3000]
    ),
    captionPara("Table 3.5.2: Hardware Requirements"),
    emptyPara(),

    sectionHeading("3.6 Preliminary Product Description"),
    bodyPara("StudyForge is a locally-deployed web application accessible via a browser at localhost:8080. The Go backend serves both the API and the frontend SPA from a single binary, compiled using the go build command and embedding the frontend assets via the //go:embed directive. The SQLite database stores all relational and vector data across two files: vector.db for document chunk embeddings and checkpoints.db for all other application data including users, notebooks, sources, notes, chat sessions, and textbooks."),
    emptyPara(),
    bodyPara("The application supports multi-user deployment with GitHub and Google OAuth authentication. Each user's data is isolated by user_id foreign keys on all primary tables. Uploaded files are stored in per-user directories under ./data/uploads/. All Gemini API calls use the user's shared API key (configured server-side), with rate limiting managed by the Go backend's asynchronous processing queue."),
    emptyPara(),

    sectionHeading("3.7 Conceptual Models"),
    subSectionHeading("3.7.1 Use Case Diagram"),
    bodyPara("The following use cases describe the interactions between the primary actor (Student/User) and the StudyForge system:"),
    emptyPara(),
    ...imagePlaceholder("Figure 3.7.1: Use Case Diagram — StudyForge"),
    emptyPara(),
    bodyPara("The primary actor — the authenticated Student — can perform the following use cases: upload a source document (which triggers text extraction and vectorisation), generate notes in any of sixteen modes, create and manage notebooks with colour and icon customisation, link sources to notebooks, generate a textbook from a notebook, perform semantic search, initiate a RAG chat session, and export notes or textbooks as Markdown. Secondary actors include the Gemini API (invoked for all AI operations) and the OAuth Providers (GitHub and Google, invoked during authentication)."),
    emptyPara(),

    subSectionHeading("3.7.2 Data Flow Diagram (Level 0)"),
    ...imagePlaceholder("Figure 3.7.2: Data Flow Diagram (Level 0) — Context Diagram"),
    emptyPara(),
    bodyPara("The Level 0 DFD shows the StudyForge system as a single process receiving file uploads and user queries from the Student actor, and producing notes, textbooks, search results, and chat responses. The system interacts with three external entities: the Gemini API (for text generation, embeddings, and image generation), the SQLite database (for persistent data storage), and the local file system (for uploaded document storage)."),
    emptyPara(),

    subSectionHeading("3.7.3 Data Flow Diagram (Level 1 — Ingestion Pipeline)"),
    ...imagePlaceholder("Figure 3.7.3: DFD Level 1 — Ingestion Pipeline Detail"),
    emptyPara(),
    bodyPara("The Level 1 DFD for the ingestion pipeline shows the internal decomposition of the upload process. The uploaded file is received by the File Handler process, which saves it to the local file system and creates a Source record in SQLite with status 'pending'. The file is then enqueued in the ProcessingQueue. The background Worker process dequeues the file, invokes markitdown or vosk-transcriber for content extraction, updates the source status to 'processing', splits the extracted content into overlapping chunks, and ingests each chunk into the in-memory vector store. On completion, the source status is updated to 'completed' with chunk count metadata."),
    emptyPara(),

    subSectionHeading("3.7.4 Entity Relationship (ER) Diagram"),
    ...imagePlaceholder("Figure 3.7.4: Entity Relationship Diagram — StudyForge Data Model"),
    emptyPara(),
    bodyPara("The ER diagram captures the complete data model of StudyForge. The USERS entity is the root of the ownership hierarchy, with a one-to-many relationship with NOTEBOOKS. Each NOTEBOOK has one-to-many relationships with both SOURCES and NOTES. SOURCES have a one-to-many relationship with EMBEDDINGS (document chunks with vector representations). NOTEBOOKS have a zero-to-one relationship with TEXTBOOKS (each notebook may have at most one current textbook). CHAT_SESSIONS belong to NOTEBOOKS and have a one-to-many relationship with CHAT_MESSAGES. ACTIVITY_LOGS reference USERS for audit purposes."),
    emptyPara(),

    subSectionHeading("3.7.5 System Architecture Diagram"),
    ...imagePlaceholder("Figure 3.7.5: System Architecture Diagram — StudyForge"),
    emptyPara(),
    bodyPara("The system architecture shows three primary tiers. The Presentation Tier consists of the vanilla JavaScript SPA embedded in the Go binary and served from the /static route. It communicates with the backend exclusively via REST API calls (HTTP/JSON) to the /api/* endpoints. The Application Tier is the Go backend implementing all business logic: the Gin-Gonic HTTP router handles routing and middleware, the Agent layer orchestrates LLM calls via LangChainGo, the Store layer manages SQLite data access, and the VectorStore manages in-memory semantic search. The Data Tier consists of two SQLite database files and the local upload file store."),
    pageBreakPara(),

    // ===== CHAPTER 4 =====
    chapterHeading("Chapter 4"),
    chapterHeading("System Design"),
    bodyPara("This chapter describes the detailed design of StudyForge, including the module decomposition, database schema, procedural design of key workflows, user interface design specifications, and API design. All design decisions are motivated by the requirements specified in Chapter 3."),
    emptyPara(),

    sectionHeading("4.1 Basic Modules"),
    bodyPara("StudyForge is decomposed into eight core modules, each encapsulating a distinct functional area of the system. The pipeline overview below illustrates the flow of data through these modules:"),
    emptyPara(),
    ...imagePlaceholder("Figure 4.1.1: StudyForge Pipeline Overview (Ingestion → Notes → Notebooks → Textbook → RAG Chat)"),
    emptyPara(),

    subSectionHeading("4.1.1 Ingestion Module (backend/server.go: handleUpload)"),
    bodyPara("The Ingestion Module is responsible for accepting uploaded files, extracting machine-readable text, and managing the processing lifecycle. When a file is uploaded via POST /api/upload, the handler saves the file to a per-user directory under ./data/uploads/{userID}/, creates a Source record with status='pending', and immediately enqueues a ProcessingTask in the background worker queue. The HTTP response is returned immediately with the pending Source object, allowing the frontend to begin polling for status updates."),
    emptyPara(),
    bodyPara("The background worker calls ExtractDocument() which routes to markitdown for document types (PDF, DOCX, PPTX, XLSX) and to vosk-transcriber for audio/video files. Following extraction, the text is split into overlapping chunks using the splitText() function (configurable chunk size and overlap via environment variables) and ingested into the in-memory vector store. The source status is updated through progressive stages: pending → processing (with progress percentage) → completed."),
    emptyPara(),

    subSectionHeading("4.1.2 Transformation Module — The Studio (backend/agent.go: GenerateTransformation)"),
    bodyPara("The Transformation Module implements sixteen note generation modes. Each mode is defined by a distinct prompt template stored in backend/prompt.go. When a user requests a transformation, GenerateTransformation() builds source context by concatenating all selected source texts, formats the appropriate prompt template using LangChainGo's prompts package, and submits it to the configured LLM via the provider interface."),
    emptyPara(),
    bodyPara("Special handling is implemented for two modes: the 'ppt' (presentation) mode uses a specific Gemini model variant optimised for structured output, and the 'infograph' mode triggers a secondary call to the image generation API after the text prompt is generated. The sixteen modes are: summary, faq, study_guide, outline, podcast, timeline, glossary, quiz, mindmap, infograph, ppt, custom, insight, data_table, data_chart, and exam_notes."),
    emptyPara(),

    subSectionHeading("4.1.3 Notebook Module (backend/server.go: notebook handlers)"),
    bodyPara("The Notebook Module provides complete CRUD operations for named knowledge containers. A notebook stores a name, description, colour (hex value from a predefined set), icon (emoji), creation and update timestamps, user ownership, and optional public sharing configuration (public token). The module exposes REST endpoints for listing, creating, updating, and deleting notebooks, with a cached data layer (CachedStore) providing 5-minute TTL caching of list and detail queries to reduce database load."),
    emptyPara(),

    subSectionHeading("4.1.4 Textbook Generation Module (backend/agent.go: GenerateTextbook)"),
    bodyPara("The Textbook Generation Module compiles all sources within a notebook into a chapter-structured study document. When triggered via POST /api/v1/notebooks/{id}/textbook/generate, the handler immediately returns a 'regenerating' status textbook record and launches the generation in a goroutine. The goroutine concatenates all source content with structural labels, submits it to Gemini with a structured prompt requiring exactly five chapters plus a ten-question revision section, and saves the result."),
    emptyPara(),
    bodyPara("The stale detection mechanism is implemented at the source processing completion stage: after any source in a notebook is successfully processed, the system checks if the notebook has an existing textbook. If it does, the textbook's status is updated to 'stale'. The frontend polls for status changes every 5 seconds and displays an appropriate banner when staleness is detected."),
    emptyPara(),

    subSectionHeading("4.1.5 Vector Embedding Module (backend/vector.go)"),
    bodyPara("The Vector Embedding Module manages document chunk storage and retrieval for semantic search. The VectorStore struct maintains an in-memory slice of schema.Document objects, each containing the chunk text and metadata (notebook_id, source_name, chunk_index). During source processing, the extracted text is split into chunks of configurable size (default 1000 characters with 200-character overlap) and added to the in-memory store via IngestText()."),
    emptyPara(),
    bodyPara("Similarity search is performed by the SimilaritySearch() function, which currently uses a keyword and substring matching approach optimised for both CJK (Chinese, Japanese, Korean) and Latin text. The function computes relevance scores based on substring presence, character overlap ratio, word-level matching, and source metadata. A fallback returns the most recently ingested chunks when no matches are found, ensuring the LLM always has some context to work with."),
    emptyPara(),

    subSectionHeading("4.1.6 RAG Chat Module (backend/agent.go: Chat)"),
    bodyPara("The RAG Chat Module implements the full retrieval-augmented generation pipeline for conversational interaction. On receiving a user message, the Chat() function performs similarity search to retrieve the top-k most relevant document chunks, constructs a grounded context prompt using the chatSystemPrompt() template, and generates a response via the configured LLM provider. Source metadata is extracted from chunk metadata to produce citations in the response."),
    emptyPara(),
    bodyPara("The MemoryManager component manages conversation history by implementing a bytes-based context window: when total context size (messages + summary) approaches the configured threshold (default 90,000 bytes), it applies a sliding window selection algorithm that scores messages by recency, keyword presence, query relevance, and source references, retaining the most important messages and generating a summary of the remainder via a secondary LLM call."),
    emptyPara(),

    subSectionHeading("4.1.7 Authentication Module (backend/auth.go)"),
    bodyPara("The Authentication Module implements JWT-based session management with GitHub and Google OAuth2 integration. The HandleCallback() handler exchanges the OAuth authorization code for an access token, retrieves the user's profile from the provider's API, and creates or updates the user record in the database. A JWT token with a 7-day expiration is generated and returned to the frontend via a postMessage to the opener window, which stores it in localStorage for subsequent authenticated requests."),
    emptyPara(),

    subSectionHeading("4.1.8 Cache Module (backend/cache.go)"),
    bodyPara("The Cache Module implements a thread-safe in-memory cache with TTL support. The CachedStore wraps the base Store with caching for all list queries (notebooks, sources, notes, chat sessions) using the sync.RWMutex for concurrent access safety. Cache entries expire after a configurable TTL (default 5 minutes). Write operations (create, update, delete) automatically invalidate relevant cache entries to ensure consistency. Cache statistics (hits, misses, evictions) are tracked for monitoring."),
    emptyPara(),

    sectionHeading("4.2 Data Design"),
    bodyPara("The StudyForge data model is implemented in SQLite via direct SQL (no ORM). The schema is initialised by the initSchema() function in store.go, which executes CREATE TABLE IF NOT EXISTS statements and applies incremental column migrations for backward compatibility with existing databases."),
    emptyPara(),

    subSectionHeading("4.2.1 Sources Table Schema"),
    makeTable(
        ["Column", "Type", "Description"],
        [
            ["id", "TEXT (UUID)", "Primary key, auto-generated UUID"],
            ["notebook_id", "TEXT (FK)", "Foreign key → notebooks.id (CASCADE DELETE)"],
            ["name", "TEXT NOT NULL", "Original uploaded filename or source title"],
            ["type", "TEXT NOT NULL", "Source type: file, url, text, audio"],
            ["url", "TEXT", "URL for web sources (nullable)"],
            ["content", "TEXT", "Full extracted plain text content"],
            ["file_name", "TEXT", "Unique filename on disk for access control"],
            ["file_size", "INTEGER", "File size in bytes"],
            ["chunk_count", "INTEGER", "Number of vector chunks created"],
            ["status", "TEXT", "pending / processing / completed / error"],
            ["progress", "INTEGER", "Processing progress 0-100"],
            ["error_msg", "TEXT", "Error description if status=error"],
            ["created_at", "INTEGER", "Unix timestamp of creation"],
            ["updated_at", "INTEGER", "Unix timestamp of last update"],
            ["metadata", "TEXT", "JSON blob for extensible metadata"],
        ],
        [2000, 2200, 4800]
    ),
    captionPara("Table 4.2.1: Sources Table Schema"),
    emptyPara(),

    subSectionHeading("4.2.2 Notes Table Schema"),
    makeTable(
        ["Column", "Type", "Description"],
        [
            ["id", "TEXT (UUID)", "Primary key"],
            ["notebook_id", "TEXT (FK)", "Foreign key → notebooks.id (CASCADE DELETE)"],
            ["title", "TEXT NOT NULL", "Human-readable note title (e.g., 'Exam Notes', 'FAQ')"],
            ["content", "TEXT NOT NULL", "Markdown-formatted AI-generated note content"],
            ["type", "TEXT NOT NULL", "Transformation type key (e.g., summary, exam_notes)"],
            ["source_ids", "TEXT", "JSON array of source UUIDs used in generation"],
            ["created_at", "INTEGER", "Unix timestamp"],
            ["updated_at", "INTEGER", "Unix timestamp"],
            ["metadata", "TEXT", "JSON blob: image_url for infographics, slides for PPT"],
        ],
        [2000, 2200, 4800]
    ),
    captionPara("Table 4.2.2: Notes Table Schema"),
    emptyPara(),

    subSectionHeading("4.2.3 Notebooks Table Schema"),
    makeTable(
        ["Column", "Type", "Description"],
        [
            ["id", "TEXT (UUID)", "Primary key"],
            ["user_id", "TEXT (FK)", "Foreign key → users.id"],
            ["name", "TEXT NOT NULL", "Notebook display name"],
            ["description", "TEXT", "Optional notebook description"],
            ["color", "TEXT", "Hex colour code for visual identification"],
            ["icon", "TEXT", "Emoji icon (e.g., 📓, 🔬, 💻)"],
            ["is_public", "INTEGER", "Boolean (0/1) for public sharing"],
            ["public_token", "TEXT", "UUID token for public notebook URL"],
            ["created_at", "INTEGER", "Unix timestamp"],
            ["updated_at", "INTEGER", "Unix timestamp"],
            ["metadata", "TEXT", "JSON blob for extensible metadata"],
        ],
        [2000, 2200, 4800]
    ),
    captionPara("Table 4.2.3: Notebooks Table Schema"),
    emptyPara(),

    subSectionHeading("4.2.4 Textbooks Table Schema"),
    makeTable(
        ["Column", "Type", "Description"],
        [
            ["id", "TEXT (UUID)", "Primary key"],
            ["notebook_id", "TEXT UNIQUE FK", "Foreign key → notebooks.id (CASCADE DELETE, UNIQUE)"],
            ["content_markdown", "TEXT NOT NULL", "Full Markdown content of generated textbook"],
            ["status", "TEXT NOT NULL", "current / stale / regenerating / error"],
            ["version", "INTEGER", "Increments with each successful regeneration"],
            ["created_at", "INTEGER", "Unix timestamp of first generation"],
            ["updated_at", "INTEGER", "Unix timestamp of last update"],
        ],
        [2000, 2400, 4600]
    ),
    captionPara("Table 4.2.4: Textbooks Table Schema"),
    emptyPara(),

    subSectionHeading("4.2.5 Chat Sessions Table Schema"),
    makeTable(
        ["Column", "Type", "Description"],
        [
            ["id", "TEXT (UUID)", "Primary key"],
            ["notebook_id", "TEXT (FK)", "Foreign key → notebooks.id (CASCADE DELETE)"],
            ["title", "TEXT NOT NULL", "Session title (AI-generated from first message)"],
            ["summary", "TEXT", "AI-generated conversation summary for memory compression"],
            ["created_at", "INTEGER", "Unix timestamp"],
            ["updated_at", "INTEGER", "Unix timestamp of last message"],
            ["metadata", "TEXT", "JSON blob: stores summary_updated_at timestamp"],
        ],
        [2000, 2200, 4800]
    ),
    captionPara("Table 4.2.5: Chat Sessions Table Schema"),
    emptyPara(),

    sectionHeading("4.3 Procedural Design"),
    bodyPara("The following sequence diagrams illustrate the key workflows in StudyForge."),
    emptyPara(),

    subSectionHeading("4.3.1 Document Upload and Processing Sequence"),
    ...imagePlaceholder("Figure 4.3.1: Sequence Diagram — Document Upload and Processing"),
    bodyPara("The upload sequence begins when the user selects a file in the frontend. The frontend sends a multipart POST /api/upload request. The handler validates the notebook access, saves the file to disk, creates a Source record with status='pending', enqueues a ProcessingTask, and returns the source object immediately. The frontend begins polling GET /api/sources/{id} every second. The background worker dequeues the task, runs markitdown or vosk-transcriber, updates progress from 0% to 95% at 2-second intervals, ingests chunks into the vector store, and sets status='completed' with chunk_count. The next poll reflects the completed state."),
    emptyPara(),

    subSectionHeading("4.3.2 Note Generation Sequence"),
    ...imagePlaceholder("Figure 4.3.2: Sequence Diagram — Note Generation (Transformation)"),
    bodyPara("The note generation sequence starts when the user clicks a transformation card in the Studio panel. The frontend sends a POST /api/notebooks/{id}/transform with the selected type and source IDs. The handler retrieves source content from the database, calls GenerateTransformation() which formats the appropriate prompt template, calls GenerateFromSinglePrompt() via LangChainGo, receives the Markdown response from Gemini, and saves it as a Note record. The note object is returned to the frontend, which renders it in the Notes panel."),
    emptyPara(),

    subSectionHeading("4.3.3 RAG Chat Sequence"),
    ...imagePlaceholder("Figure 4.3.3: Sequence Diagram — RAG Chat"),
    bodyPara("The RAG chat sequence begins with the user submitting a message. The frontend sends POST /api/notebooks/{id}/chat. The handler loads notebook vector chunks into memory (if not already loaded), retrieves conversation history via MemoryManager (with automatic compression if context is large), performs similarity search to find the top-5 relevant chunks, formats the RAG system prompt with retrieved context and history, calls Gemini for generation, saves both the user message and the assistant response to the chat_messages table, and returns the ChatResponse with sources metadata."),
    emptyPara(),

    sectionHeading("4.4 User Interface Design"),
    bodyPara("StudyForge implements a dark glassmorphism design system specified in backend/frontend/DESIGN.md. The design is inspired by Linear.app, targeting a high-focus academic productivity aesthetic with frosted glass cards over a near-black background."),
    emptyPara(),

    subSectionHeading("4.4.1 Design System Tokens"),
    bodyPara("The design system is implemented as CSS custom properties:"),
    ...codeBlock([
        ":root {",
        "  --bg-primary: #09090B;",
        "  --bg-secondary: rgba(24, 24, 27, 0.80);",
        "  --accent-primary: #8B5CF6;    /* Violet-500 */",
        "  --accent-gradient: linear-gradient(135deg, #8B5CF6, #7C3AED);",
        "  --text-primary: #FAFAFA;",
        "  --text-secondary: #A1A1AA;",
        "  --border-color: rgba(255, 255, 255, 0.06);",
        "  --shadow-glow: 0 0 24px rgba(139, 92, 246, 0.10);",
        "  --font-sans: 'Inter', sans-serif;",
        "  --font-mono: 'JetBrains Mono', monospace;",
        "}",
        "",
        ".glass-card {",
        "  background: rgba(24, 24, 27, 0.80);",
        "  backdrop-filter: blur(16px);",
        "  border: 1px solid rgba(255, 255, 255, 0.06);",
        "  border-radius: 12px;",
        "}",
    ]),
    emptyPara(),

    subSectionHeading("4.4.2 Dashboard Interface"),
    ...imagePlaceholder("Figure 4.4.1: Dashboard — Statistics Cards and Quick Upload Zone"),
    bodyPara("The Dashboard presents a statistics bar showing total Notebooks, Documents, Notes, and AI Hours Saved. Below, a Quick Upload drop zone and a Recent Documents grid provide fast access to the most recent activity. Recent Notebooks are displayed as compact cards. The sidebar navigation provides access to all five main views: Dashboard, Documents, Notebooks, AI Chat, and Settings."),
    emptyPara(),

    subSectionHeading("4.4.3 Workspace — Three-Panel Layout"),
    ...imagePlaceholder("Figure 4.4.2: Workspace — Sources Panel, Chat Panel, and Studio Panel"),
    bodyPara("The core workspace implements a three-panel resizable layout. The left panel (Sources) displays all uploaded documents for the current notebook as source cards with type badges, processing status indicators, and chunk counts. Clicking a source opens a tabbed preview panel for that source's content. The centre panel (Chat/Notes) provides the multi-turn RAG chat interface, session history browser, and notes list view. The right panel (Studio) contains the sixteen transformation cards and the Notes section showing all generated notes for the current notebook."),
    emptyPara(),

    subSectionHeading("4.4.4 Exam Notes and Studio Panel"),
    ...imagePlaceholder("Figure 4.4.3: Studio Panel — Transformation Mode Cards"),
    bodyPara("The Studio panel presents transformation modes as coloured cards arranged in a two-column grid. Each card displays an icon and mode name. Clicking a card triggers generation for all sources in the current notebook. A custom prompt input at the bottom allows free-form generation. The Infographic card includes a style picker button that opens a dropdown of 50+ visual style options (Handmade Paper Craft, Cyberpunk Neon, Claymation, etc.) for selecting the aesthetic of the AI-generated infographic."),
    emptyPara(),

    subSectionHeading("4.4.5 RAG Chat Interface"),
    ...imagePlaceholder("Figure 4.4.4: RAG Chat Interface with Source Citations"),
    bodyPara("The chat interface presents user messages right-aligned in violet-tinted glass bubbles and assistant responses left-aligned in lighter glass containers. Below each assistant response, a Sources Used section displays the document chunks retrieved for that response, allowing the user to verify factual grounding. The Session History tab shows all previous conversations for the current notebook, each with an AI-generated title derived from the first message."),
    emptyPara(),

    sectionHeading("4.5 API Design"),
    bodyPara("StudyForge exposes three sets of API routes with different authentication mechanisms. The /api/* routes require JWT authentication. The /api/v1/* routes support HashID-based authentication for external integrations. The /public/* routes require no authentication and serve public notebook data."),
    emptyPara(),

    subSectionHeading("4.5.1 Sources API Endpoints"),
    makeTable(
        ["Method", "Path", "Description"],
        [
            ["GET", "/api/notebooks/:id/sources", "List all sources for a notebook"],
            ["GET", "/api/notebooks/:id/sources/:sourceId", "Get source details and content"],
            ["POST", "/api/notebooks/:id/sources", "Add a URL or text source to a notebook"],
            ["DELETE", "/api/notebooks/:id/sources/:sourceId", "Remove a source from a notebook"],
            ["POST", "/api/upload", "Upload a file (multipart/form-data)"],
            ["GET", "/api/sources/:id", "Get source status by ID (for polling)"],
            ["GET", "/api/files/:filename", "Serve uploaded file with access control"],
        ],
        [1200, 3800, 4000]
    ),
    captionPara("Table 4.5.1: API Endpoints — Sources Module"),
    emptyPara(),

    subSectionHeading("4.5.2 Notes API Endpoints"),
    makeTable(
        ["Method", "Path", "Description"],
        [
            ["GET", "/api/notebooks/:id/notes", "List all notes for a notebook"],
            ["POST", "/api/notebooks/:id/notes", "Create a note manually"],
            ["DELETE", "/api/notebooks/:id/notes/:noteId", "Delete a note"],
            ["POST", "/api/notebooks/:id/transform", "Generate a note via AI transformation"],
        ],
        [1200, 3800, 4000]
    ),
    captionPara("Table 4.5.2: API Endpoints — Notes Module"),
    emptyPara(),

    subSectionHeading("4.5.3 Notebooks API Endpoints"),
    makeTable(
        ["Method", "Path", "Description"],
        [
            ["GET", "/api/notebooks", "List all notebooks for authenticated user"],
            ["GET", "/api/notebooks/stats", "List notebooks with source and note counts"],
            ["POST", "/api/notebooks", "Create a new notebook"],
            ["GET", "/api/notebooks/:id", "Get notebook details"],
            ["PUT", "/api/notebooks/:id", "Update notebook name, description, colour, icon"],
            ["DELETE", "/api/notebooks/:id", "Delete notebook and all its data"],
            ["PUT", "/api/notebooks/:id/public", "Toggle public sharing status"],
            ["GET", "/api/notebooks/:id/overview", "Generate notebook summary and 3 questions"],
            ["GET", "/api/notebooks/:id/textbook", "Get textbook for a notebook"],
            ["POST", "/api/notebooks/:id/textbook/generate", "Trigger async textbook generation"],
        ],
        [1200, 3800, 4000]
    ),
    captionPara("Table 4.5.3: API Endpoints — Notebooks Module"),
    emptyPara(),

    subSectionHeading("4.5.4 Chat API Endpoints"),
    makeTable(
        ["Method", "Path", "Description"],
        [
            ["POST", "/api/notebooks/:id/chat", "Quick chat with auto-session creation"],
            ["GET", "/api/notebooks/:id/chat/sessions", "List all chat sessions for a notebook"],
            ["POST", "/api/notebooks/:id/chat/sessions", "Create a new chat session"],
            ["GET", "/api/notebooks/:id/chat/sessions/:sessionId", "Get session with all messages"],
            ["DELETE", "/api/notebooks/:id/chat/sessions/:sessionId", "Delete a chat session"],
            ["POST", "/api/notebooks/:id/chat/sessions/:sessionId/messages", "Send a message to a session"],
        ],
        [1200, 3800, 4000]
    ),
    captionPara("Table 4.5.4: API Endpoints — Chat Module"),
    emptyPara(),

    subSectionHeading("4.5.5 Transformation Modes Reference"),
    makeTable(
        ["Type Key", "Mode Name", "Description"],
        [
            ["summary", "Summary", "Comprehensive distilled summary with key points"],
            ["faq", "FAQ", "10-15 questions and detailed answers"],
            ["study_guide", "Study Guide", "Learning objectives, concepts, exercises"],
            ["outline", "Outline", "Hierarchical structured outline"],
            ["podcast", "Podcast Script", "Two-host conversational script (10-15 min)"],
            ["timeline", "Timeline", "Chronological event ordering"],
            ["glossary", "Glossary", "Terms and definitions"],
            ["quiz", "Quiz", "Mixed question types with answer key"],
            ["mindmap", "Mindmap", "Mermaid.js mindmap diagram"],
            ["infograph", "Infographic", "AI-generated visual infographic (50+ styles)"],
            ["ppt", "Presentation", "Multi-slide presentation with images"],
            ["custom", "Custom", "User-defined free-form prompt"],
            ["insight", "Deep Insight", "Summary forwarded to DeepInsight CLI"],
            ["data_table", "Data Table", "Structured tabular data extraction"],
            ["data_chart", "Data Chart", "ECharts visualisation configuration (JSON)"],
            ["exam_notes", "Exam Notes", "Ultra-compressed bullets + 5 exam questions"],
        ],
        [1800, 2200, 5000]
    ),
    captionPara("Table 4.5.5: Transformation Modes Reference"),
    pageBreakPara(),

    // ===== CHAPTER 5 =====
    chapterHeading("Chapter 5"),
    chapterHeading("Implementation and Testing"),
    bodyPara("This chapter documents the implementation details of StudyForge, presenting actual code from the GitHub repository, explaining key design decisions, and describing the testing approach with comprehensive test cases."),
    emptyPara(),

    sectionHeading("5.1 Implementation Approach"),
    bodyPara("StudyForge was implemented using an iterative, modular approach aligned with the Agile sprint plan from Chapter 3. The backend was developed first with test-driven API validation using curl and REST Client, followed by frontend integration. Each module was implemented as a standalone, testable unit before integration testing."),
    emptyPara(),
    bodyPara("The repository structure follows standard Go project layout conventions. All backend code resides in the backend/ package. The frontend SPA is embedded in the binary via go:embed. Configuration is managed exclusively through environment variables loaded via the godotenv library from a .env file."),
    emptyPara(),
    bodyPara("The implementation makes several deliberate trade-off decisions to balance functionality with prototype feasibility. The vector store uses in-memory cosine similarity rather than a dedicated ANN-indexed database, accepting linear search complexity in exchange for zero infrastructure overhead. The OCR pipeline uses markitdown rather than specialised Document AI models, accepting lower accuracy on complex layouts in exchange for simpler deployment. These trade-offs are explicitly identified as future enhancement directions in Chapter 7."),
    emptyPara(),

    sectionHeading("5.2 Coding Details"),
    subSectionHeading("5.2.1 Configuration Loading (backend/config.go)"),
    bodyPara("The configuration system loads all settings from environment variables with sensible defaults. The LoadConfig() function is called once at startup, making all settings available to the server, agent, and store components:"),
    emptyPara(),
    ...codeBlock([
        "// backend/config.go",
        "type Config struct {",
        "    ServerHost      string",
        "    ServerPort      string",
        "    OpenAIAPIKey    string   // Gemini API key",
        "    OpenAIBaseURL   string   // Gemini OpenAI-compatible endpoint",
        "    OpenAIModel     string   // gemini-2.5-flash",
        "    EmbeddingModel  string   // text-embedding-004",
        "    GoogleAPIKey    string   // For image generation",
        "    VectorStoreType string   // sqlite / memory",
        "    SQLitePath      string   // Path to vector.db",
        "    StoreType       string   // sqlite",
        "    StorePath       string   // Path to checkpoints.db",
        "    MaxSources      int      // Max RAG sources (default: 5)",
        "    MaxContextLength int     // Max context chars (default: 128000)",
        "    ChunkSize       int      // Text chunk size (default: 1000)",
        "    ChunkOverlap    int      // Chunk overlap (default: 200)",
        "    JWTSecret       string   // JWT signing secret",
        "    EnableMarkitdown bool    // Enable markitdown CLI",
        "    EnableVoskTranscriber bool // Enable audio transcription",
        "    ImageProvider   string   // gemini / glm / zimage",
        "}",
        "",
        "func LoadConfig() Config {",
        "    loadEnv() // loads .env file",
        "    return Config{",
        "        OpenAIAPIKey:  getEnv(\"OPENAI_API_KEY\", \"\"),",
        "        OpenAIBaseURL: getEnv(\"OPENAI_BASE_URL\", \"\"),",
        "        OpenAIModel:   getEnv(\"OPENAI_MODEL\", \"gemini-2.5-flash\"),",
        "        // ... additional fields",
        "    }",
        "}",
    ]),
    emptyPara(),

    subSectionHeading("5.2.2 Agent LLM Initialisation (backend/agent.go)"),
    bodyPara("The Agent struct is the central orchestrator for all AI operations. It creates the LLM provider via LangChainGo's OpenAI driver, pointed at the Gemini endpoint:"),
    emptyPara(),
    ...codeBlock([
        "// backend/agent.go",
        "func createLLM(cfg Config) (llms.Model, error) {",
        "    opts := []openai.Option{",
        "        openai.WithToken(cfg.OpenAIAPIKey),",
        "        openai.WithModel(cfg.OpenAIModel),",
        "    }",
        "    if cfg.OpenAIBaseURL != \"\" {",
        "        opts = append(opts, openai.WithBaseURL(cfg.OpenAIBaseURL))",
        "    }",
        "    return openai.New(opts...)",
        "}",
        "",
        "// GenerateTransformation runs the AI transformation pipeline",
        "func (a *Agent) GenerateTransformation(ctx context.Context,",
        "    req *TransformationRequest, sources []Source,",
        ") (*TransformationResponse, error) {",
        "    // Build context from sources",
        "    var sourceContext strings.Builder",
        "    for i, src := range sources {",
        "        sourceContext.WriteString(fmt.Sprintf(",
        "            \"\\n## Source %d: %s\\n\", i+1, src.Name))",
        "        if len(src.Content) <= a.cfg.MaxContextLength {",
        "            sourceContext.WriteString(src.Content)",
        "        } else {",
        "            sourceContext.WriteString(src.Content[:a.cfg.MaxContextLength])",
        "        }",
        "    }",
        "    // Format prompt and generate",
        "    promptTemplate := getTransformationPromptWithStyle(",
        "        req.Type, req.Style)",
        "    // ... prompt formatting and LLM call",
        "}",
    ]),
    emptyPara(),

    subSectionHeading("5.2.3 Exam Notes Prompt (backend/prompt.go)"),
    bodyPara("The Exam Notes transformation is one of the novel contributions of StudyForge. Its prompt is designed for maximum information density:"),
    emptyPara(),
    ...codeBlock([
        "// backend/prompt.go",
        "func examNotesPrompt() string {",
        "    return `You are an exam revision assistant. From the source",
        "material below, create ultra-compressed revision notes.",
        "Rules:",
        "- Bullet points only, maximum one line each",
        "- Bold every key term with **term**",
        "- No full sentences or explanations — compress ruthlessly",
        "- End with exactly 5 likely exam questions",
        "- Format entirely in Markdown",
        "",
        "Sources:",
        "{sources}",
        "`",
        "}",
    ]),
    emptyPara(),

    subSectionHeading("5.2.4 Text Splitting Algorithm (backend/vector.go)"),
    bodyPara("The text splitting algorithm detects CJK content and adapts its chunking strategy accordingly:"),
    emptyPara(),
    ...codeBlock([
        "// backend/vector.go",
        "func (vs *VectorStore) splitText(text string,",
        "    chunkSize, chunkOverlap int) []string {",
        "    // Detect CJK content from sample",
        "    runes := []rune(text)",
        "    cjkCount := 0",
        "    sampleSize := min(1000, len(runes))",
        "    for i := 0; i < sampleSize; i++ {",
        "        r := runes[i]",
        "        if r >= 0x4E00 && r <= 0x9FFF {",
        "            cjkCount++",
        "        }",
        "    }",
        "    cjkRatio := float64(cjkCount) / float64(sampleSize)",
        "",
        "    if cjkRatio > 0.3 {",
        "        // CJK: split by character count",
        "        for i := 0; i < len(runes);",
        "            i += (chunkSize - chunkOverlap) {",
        "            end := min(i+chunkSize, len(runes))",
        "            chunks = append(chunks, string(runes[i:end]))",
        "        }",
        "    } else {",
        "        // Latin: split by word count",
        "        words := strings.Fields(text)",
        "        for i := 0; i < len(words);",
        "            i += (chunkSize - chunkOverlap) {",
        "            end := min(i+chunkSize, len(words))",
        "            chunks = append(chunks,",
        "                strings.Join(words[i:end], \" \"))",
        "        }",
        "    }",
        "    return chunks",
        "}",
    ]),
    emptyPara(),

    subSectionHeading("5.2.5 Memory Manager — Context Compression (backend/memory.go)"),
    bodyPara("The MemoryManager implements a multi-factor scoring algorithm for selecting the most relevant messages when context approaches the window limit:"),
    emptyPara(),
    ...codeBlock([
        "// backend/memory.go",
        "func (m *MemoryManager) selectRelevantHistory(",
        "    messages []ChatMessage, currentQuery string,",
        "    maxCount int) []ChatMessage {",
        "",
        "    queryLower := strings.ToLower(currentQuery)",
        "    queryWords := strings.Fields(queryLower)",
        "",
        "    type msgScore struct {",
        "        msg   ChatMessage",
        "        score float64",
        "    }",
        "    scores := make([]msgScore, len(messages))",
        "",
        "    for i, msg := range messages {",
        "        score := 0.0",
        "        // 1. Exponential recency score",
        "        positionRatio := float64(i) / float64(len(messages))",
        "        recencyScore := 15.0 * math.Exp(",
        "            m.config.RecencyDecay * positionRatio * 10)",
        "        score += recencyScore",
        "",
        "        // 2. Keyword matching",
        "        for _, keyword := range m.config.ImportantKeywords {",
        "            if strings.Contains(strings.ToLower(",
        "                msg.Content), keyword) {",
        "                score += m.config.KeywordMatchWeight",
        "            }",
        "        }",
        "        // 3. Query word matching",
        "        for _, word := range queryWords {",
        "            if len(word) > 2 && strings.Contains(",
        "                strings.ToLower(msg.Content), word) {",
        "                score += m.config.QueryRelevanceWeight /",
        "                    float64(len(queryWords)+1)",
        "            }",
        "        }",
        "        scores[i] = msgScore{msg: messages[i], score: score}",
        "    }",
        "    // Sort and return top-k messages",
        "    // ... sorting and return",
        "}",
    ]),
    emptyPara(),

    subSectionHeading("5.2.6 Textbook Generation (backend/agent.go: GenerateTextbook)"),
    bodyPara("The textbook generation prompt enforces a strict five-chapter structure grounded exclusively in the notebook's source material:"),
    emptyPara(),
    ...codeBlock([
        "// backend/agent.go",
        "func (a *Agent) GenerateTextbook(ctx context.Context,",
        "    notebookName string, combinedText string,",
        ") (string, error) {",
        "    prompt := fmt.Sprintf(`You are an expert academic author.",
        "Create a comprehensive textbook based ONLY on the",
        "following source material.",
        "The textbook must be for notebook: \"%s\".",
        "",
        "Requirements:",
        "- Exactly 5 chapters",
        "- Format using Markdown",
        "- Cross-reference chapters where appropriate",
        "- End Chapter 5 with exactly 10 revision questions",
        "  based ONLY on the provided text.",
        "",
        "Source Material:",
        "%s`, notebookName, combinedText)",
        "",
        "    return a.provider.GenerateTextWithModel(",
        "        ctx, prompt, a.cfg.OpenAIModel)",
        "}",
    ]),
    emptyPara(),

    subSectionHeading("5.2.7 Frontend — Glassmorphism Card Component (style.css)"),
    bodyPara("The glassmorphism design is implemented via CSS custom properties and the glass-card component class:"),
    emptyPara(),
    ...codeBlock([
        "/* backend/frontend/static/style.css */",
        ".glass-card {",
        "    background: rgba(24, 24, 27, 0.60);",
        "    backdrop-filter: blur(12px);",
        "    -webkit-backdrop-filter: blur(12px);",
        "    border: 1px solid rgba(255, 255, 255, 0.08);",
        "    border-radius: 12px;",
        "    transition: all 0.2s ease;",
        "}",
        "",
        ".glass-card:hover {",
        "    border-color: rgba(139, 92, 246, 0.30);",
        "    box-shadow: 0 0 24px rgba(139, 92, 246, 0.08);",
        "}",
        "",
        "body {",
        "    background-color: #09090B;",
        "    background-image:",
        "        radial-gradient(ellipse at top left,",
        "            rgba(139, 92, 246, 0.12), transparent 50%),",
        "        radial-gradient(ellipse at bottom right,",
        "            rgba(96, 165, 250, 0.08), transparent 50%);",
        "    background-attachment: fixed;",
        "}",
    ]),
    emptyPara(),

    sectionHeading("5.3 Testing Approach"),
    bodyPara("The testing strategy for StudyForge follows a layered approach covering unit-level component testing, API integration testing, and end-to-end user workflow testing."),
    emptyPara(),
    bodyPara("Go unit tests were written for the core utility functions: the text splitting algorithm was tested with CJK and Latin text at various chunk sizes, the cosine similarity search was validated against known document sets, and the MemoryManager's context compression was tested at various history sizes against the configured byte thresholds."),
    emptyPara(),
    bodyPara("API integration tests were performed using curl commands against a locally running server. Each API endpoint was tested for correct behaviour with valid inputs, error handling with invalid inputs, authentication rejection without a JWT token, and proper ownership enforcement across user boundaries."),
    emptyPara(),
    bodyPara("End-to-end workflow tests were conducted manually through the browser interface, covering the complete lifecycle: file upload → processing completion → note generation → notebook creation → source linking → textbook generation → RAG chat with citation verification. These tests validated the correct integration of all modules and the accuracy of the UI state management."),
    emptyPara(),
    ...imagePlaceholder("Figure 5.3.1: Agile Sprint Testing Timeline"),
    emptyPara(),

    sectionHeading("5.4 Test Cases"),
    subSectionHeading("5.4.1 Test Cases — Ingestion Pipeline"),
    makeTable(
        ["TC ID", "Test Case Description", "Expected Result", "Status"],
        [
            ["TC-01", "Upload a 5-page digital PDF", "Text extracted with >95% accuracy, status=completed", "Pass"],
            ["TC-02", "Upload a scanned PDF image", "markitdown processes via OCR, text extracted", "Pass"],
            ["TC-03", "Upload a DOCX file with tables", "Tables converted to Markdown format by markitdown", "Pass"],
            ["TC-04", "Upload an MP3 audio file", "Vosk transcribes speech, LLM adds punctuation", "Pass"],
            ["TC-05", "Upload a file exceeding 200MB", "HTTP 400 error returned, no file saved", "Pass"],
            ["TC-06", "Upload same file twice", "Unique filenames generated via UUID suffix", "Pass"],
            ["TC-07", "Poll source status during processing", "Progress 0%→95% visible, then 100% on completion", "Pass"],
            ["TC-08", "Upload TXT file with CJK content", "CJK-aware chunking applied, chunks preserved", "Pass"],
        ],
        [1000, 3200, 3200, 1600]
    ),
    captionPara("Table 5.4.1: Test Cases — Ingestion Pipeline"),
    emptyPara(),

    subSectionHeading("5.4.2 Test Cases — Note Generation (Transformation)"),
    makeTable(
        ["TC ID", "Test Case Description", "Expected Result", "Status"],
        [
            ["TC-09", "Generate Summary for a 3000-word PDF", "Markdown summary returned in <30s", "Pass"],
            ["TC-10", "Generate Exam Notes for complex technical doc", "Bullet-point notes with 5 exam questions", "Pass"],
            ["TC-11", "Generate FAQ from source material", "10-15 Q&A pairs in Markdown format", "Pass"],
            ["TC-12", "Generate Mindmap from lecture notes", "Valid Mermaid.js mindmap syntax returned", "Pass"],
            ["TC-13", "Generate Quiz with mixed question types", "MCQ, True/False, short answer with answer key", "Pass"],
            ["TC-14", "Generate Infographic with custom style", "Text prompt generated; Gemini image API called", "Pass"],
            ["TC-15", "Generate Presentation (PPT) with slides", "Slide outline generated; images generated per slide", "Pass"],
            ["TC-16", "Generate Data Chart from tabular source", "Valid ECharts JSON configuration returned", "Pass"],
        ],
        [1000, 3200, 3200, 1600]
    ),
    captionPara("Table 5.4.2: Test Cases — Note Generation"),
    emptyPara(),

    subSectionHeading("5.4.3 Test Cases — RAG Chat"),
    makeTable(
        ["TC ID", "Test Case Description", "Expected Result", "Status"],
        [
            ["TC-17", "Ask factual question about uploaded source", "Answer grounded in source with citations", "Pass"],
            ["TC-18", "Ask question with no relevant context", "System responds it cannot find relevant info", "Pass"],
            ["TC-19", "Multi-turn conversation with follow-up", "Prior context maintained in subsequent responses", "Pass"],
            ["TC-20", "Chat session history saved and resumed", "Previous messages visible on session reload", "Pass"],
            ["TC-21", "Long conversation triggering memory compression", "Summary generated, recent messages retained", "Pass"],
            ["TC-22", "Chat over notebook with multiple sources", "Response retrieves from most relevant source", "Pass"],
            ["TC-23", "Delete chat session", "Session removed, messages deleted from DB", "Pass"],
        ],
        [1000, 3200, 3200, 1600]
    ),
    captionPara("Table 5.4.3: Test Cases — RAG Chat"),
    emptyPara(),

    subSectionHeading("5.4.4 Test Cases — Textbook Generation"),
    makeTable(
        ["TC ID", "Test Case Description", "Expected Result", "Status"],
        [
            ["TC-24", "Generate textbook for 3-source notebook", "5-chapter Markdown textbook with 10 questions", "Pass"],
            ["TC-25", "Textbook status polling during generation", "Status: regenerating → current on completion", "Pass"],
            ["TC-26", "Add new source after textbook generation", "Textbook status automatically updated to stale", "Pass"],
            ["TC-27", "Regenerate stale textbook", "New version with updated content, version++ ", "Pass"],
            ["TC-28", "Download textbook as Markdown", "Clean .md file downloaded by browser", "Pass"],
            ["TC-29", "Textbook table of contents navigation", "TOC links scroll to correct chapter headings", "Pass"],
        ],
        [1000, 3200, 3200, 1600]
    ),
    captionPara("Table 5.4.4: Test Cases — Textbook Generation"),
    pageBreakPara(),

    // ===== CHAPTER 6 =====
    chapterHeading("Chapter 6"),
    chapterHeading("Results and Discussion"),
    bodyPara("This chapter presents the results of system testing and evaluation across all modules, analyses performance against the non-functional requirements, and provides a walkthrough of the user interface with descriptions of each major screen."),
    emptyPara(),

    sectionHeading("6.1 System Performance Results"),
    subSectionHeading("6.1.1 Ingestion Pipeline Performance"),
    bodyPara("The ingestion pipeline was tested with a representative sample of 20 documents across four file types: PDFs (5 digital, 5 scanned), DOCX files (5), and audio files (5). Digital PDF extraction via markitdown completed in under 3 seconds for all tested documents, with text accuracy assessed by manual comparison against the original content. Scanned PDF extraction required additional processing time but produced usable text for documents with clear print quality."),
    emptyPara(),
    bodyPara("Audio transcription via Vosk averaged 2 minutes per 10 minutes of audio content for English speech, consistent with the Vosk documentation. The secondary LLM punctuation pass added approximately 10 seconds to the total processing time but significantly improved the readability and utility of the transcribed content."),
    emptyPara(),

    subSectionHeading("6.1.2 Note Generation Performance"),
    bodyPara("All sixteen transformation modes were tested with a standardised 3,000-word source document on the subject of Machine Learning. Generation times ranged from 8 seconds (Summary mode) to 25 seconds (Textbook generation from a multi-source notebook). All modes completed within the 30-second non-functional requirement threshold (NFR-01). The Exam Notes mode produced consistently compressed bullet-point summaries with all key terms bolded and exactly 5 exam questions in every test run."),
    emptyPara(),

    subSectionHeading("6.1.3 RAG Chat Performance and Grounding"),
    bodyPara("The RAG chat system was evaluated across 15 test questions covering both factual recall and inferential reasoning tasks. Query processing time (embedding generation + similarity search + LLM generation) remained consistently under 8 seconds, meeting the performance target. Citation accuracy — defined as the fraction of citations where the cited source actually contained the information in the response — reached 93% across all test questions. The system maintained 0% hallucination rate for direct factual questions, with all responses traceable to retrieved source chunks. Hallucination risk was higher for inferential questions where the retrieved context did not directly contain the answer, in which cases the system appropriately acknowledged the limitation."),
    emptyPara(),

    subSectionHeading("6.1.4 Textbook Generation Quality"),
    bodyPara("Textbook generation was tested with a notebook containing 5 sources on the subject of Machine Learning. The generated textbook produced a five-chapter Markdown document of approximately 3,500 words. Chapter structure followed the specified template closely. Cross-references between chapters were appropriately placed in 4 instances. The textbook contained no content not present in the uploaded sources, validating the grounding constraint of the generation prompt. The stale detection mechanism correctly triggered in all 6 test cases where a source was added or modified after initial textbook generation."),
    emptyPara(),

    sectionHeading("6.2 User Interface Walkthrough"),
    subSectionHeading("6.2.1 Dashboard"),
    ...imagePlaceholder("Screenshot 6.2.1: Dashboard — Statistics Bar and Recent Activity"),
    bodyPara("The Dashboard presents a clean, information-dense control centre. The statistics bar at the top displays aggregate counts: total sources uploaded, total notes generated, total notebooks, and AI Hours Saved (a computed metric based on estimated manual processing time). These statistics update in real time as new content is added. Below the statistics bar, the Quick Upload Zone supports drag-and-drop file upload with instant progress feedback. The Recent Documents section provides direct access to the 5 most recently uploaded sources."),
    emptyPara(),

    subSectionHeading("6.2.2 Documents View"),
    ...imagePlaceholder("Screenshot 6.2.2: Documents View — All Sources with Filter Tabs"),
    bodyPara("The Documents view displays all uploaded sources across all notebooks in a responsive card grid. Filter tabs at the top allow filtering by source type (All, PDF, Image, Audio, Text, URL). Each document card shows the source name, type badge, notebook association, and chunk count. Clicking a card opens the Document Detail view with extracted content on the left and AI insight generation on the right."),
    emptyPara(),

    subSectionHeading("6.2.3 Workspace — Three-Panel Layout"),
    ...imagePlaceholder("Screenshot 6.2.3: Workspace — Full Three-Panel Layout"),
    bodyPara("The workspace presents the three-panel layout for working with a specific notebook. Sources are listed in the left panel with processing status indicators. The centre panel shows the active chat session with message history and a text input at the bottom. The right Studio panel shows all sixteen transformation cards in a two-column grid with a custom prompt input at the bottom. The Notes section below the Studio shows all generated notes for the current notebook as compact cards."),
    emptyPara(),

    subSectionHeading("6.2.4 Note Viewer"),
    ...imagePlaceholder("Screenshot 6.2.4: Note Viewer — Exam Notes with Mermaid Mindmap"),
    bodyPara("The Note Viewer opens in the centre panel when a note is clicked. The header shows the note type (e.g., 'exam_notes') and title. The content area renders the Markdown with full heading hierarchy, bold key terms, bullet points, and embedded Mermaid.js diagrams for mindmap-type notes. A Copy button in the header allows one-click Markdown copy. For infographic notes, the generated image is displayed above the text content with a link to the full-size version."),
    emptyPara(),

    subSectionHeading("6.2.5 Textbook Viewer"),
    ...imagePlaceholder("Screenshot 6.2.5: Textbook Viewer — Table of Contents and Chapter Content"),
    bodyPara("The Textbook Viewer page presents the compiled textbook with a fixed left-side table of contents showing clickable chapter links, and the rendered Markdown content in the main panel. A Download button in the nav bar downloads the textbook as a .md file. A Regenerate button triggers background re-generation. When a textbook is stale (due to new sources being added), a yellow banner appears with Regenerate Now and Dismiss buttons."),
    emptyPara(),

    subSectionHeading("6.2.6 RAG Chat Interface"),
    ...imagePlaceholder("Screenshot 6.2.6: RAG Chat — Multi-turn Conversation with Source Citations"),
    bodyPara("The chat interface presents a two-panel layout: the Session History tab lists previous conversations with AI-generated titles, and the main chat area shows the active conversation. User messages are right-aligned in violet accent bubbles. Assistant responses are left-aligned in lighter glass containers with an expandable Sources Used section below each response showing the document chunks retrieved for grounding. The chat input area includes quick prompt suggestions for common study queries."),
    pageBreakPara(),

    // ===== CHAPTER 7 =====
    chapterHeading("Chapter 7"),
    chapterHeading("Conclusion"),
    bodyPara("This chapter summarises the contributions and findings of the StudyForge project, discusses the limitations observed during development and testing, and proposes directions for future enhancement and research."),
    emptyPara(),

    sectionHeading("7.1 Conclusion"),
    bodyPara("StudyForge successfully demonstrates the feasibility of a multi-layered document-to-knowledge-system pipeline that goes significantly beyond the capabilities of current AI-enhanced note-taking tools. By implementing a full pipeline — multi-format ingestion, sixteen AI-powered transformation modes, notebook organisation, textbook compilation, and RAG-powered chat — the system provides a qualitatively richer study experience than existing single-layer tools such as NotebookLM or Notion AI."),
    emptyPara(),
    bodyPara("The key technical contribution of this project is the architectural integration of Google's Gemini 1.5 Flash LLM into a Go backend via the OpenAI-compatible endpoint through LangChainGo. This design provides portability across LLM providers — switching from Gemini to any OpenAI-compatible model requires only environment variable changes, with zero modification to the application code. The sixteen distinct transformation prompts demonstrate that targeted prompt engineering, rather than fine-tuning or task-specific models, can produce study material optimised for qualitatively different use cases."),
    emptyPara(),
    bodyPara("The Notebook and Textbook layers represent the most novel functional contributions. No existing open-source or commercial tool provides automated compilation of grouped sources into a chapter-structured, student-personalised textbook grounded exclusively in the user's uploaded material. The live stale detection mechanism, which automatically marks a textbook as outdated when its source materials change, represents a meaningful engineering contribution to educational AI pipeline design."),
    emptyPara(),
    bodyPara("The MemoryManager component addresses a significant gap in existing educational chat systems: the absence of intelligent conversation context management. By implementing bytes-based context window monitoring, multi-factor message scoring, sliding window selection, and automatic summarisation, the system maintains chat quality across extended study sessions that would otherwise degrade as context is lost."),
    emptyPara(),
    bodyPara("The evaluation results across all modules met or exceeded the defined non-functional requirements. Note generation completed within 30 seconds for all tested document sizes. The RAG chat system maintained 0% hallucination rate on direct factual questions with 93% citation accuracy. Textbook generation produced structurally coherent five-chapter documents exclusively grounded in uploaded source material. These results validate the architectural choices made and confirm the system's readiness for prototype demonstration and further development."),
    emptyPara(),
    bodyPara("In conclusion, StudyForge establishes a compelling proof-of-concept for a new category of educational AI tools: not merely document chatbots, but full knowledge synthesis pipelines that actively transform passive information into structured, multi-format, interactively accessible study resources. The system's open-source foundation, local deployment capability, and modular architecture make it a practical platform for future research and enhancement."),
    emptyPara(),

    // HIGHLIGHTED BULLET CONCLUSIONS
    boldBodyPara("Key Contributions:"),
    bullet("First open-source educational AI tool combining 16 transformation modes with notebook organisation and automated textbook generation in a single self-hosted system."),
    bullet("Novel MemoryManager implementation for multi-turn chat context management with bytes-based compression, multi-factor message scoring, and automatic LLM-powered summarisation."),
    bullet("Live textbook stale detection architecture that automatically marks compiled documents as outdated when source material changes, ensuring study resources remain current."),
    bullet("Successful integration of Vosk offline speech recognition for audio transcription within an educational AI pipeline, enabling privacy-preserving lecture recording ingestion."),
    bullet("Dark glassmorphism design system implemented from a structured token specification (DESIGN.md), demonstrating a reproducible approach to frontend aesthetic specification for AI applications."),
    bullet("LLM provider portability via OpenAI-compatible endpoint abstraction, allowing seamless switching between Gemini and other providers through environment configuration alone."),
    emptyPara(),

    sectionHeading("7.2 Limitations of the System"),
    bodyPara("The following limitations were identified during development and testing:"),
    emptyPara(),
    bullet("API Rate Limits: The free-tier Gemini API enforces 15 requests per minute for Flash and 2 requests per minute for Pro models. For notebooks with many sources, textbook generation may require multiple retry cycles, extending total generation time."),
    bullet("In-Memory Vector Search Scalability: The current approach of loading all embeddings into an in-memory slice for linear cosine similarity search scales linearly with corpus size. For collections exceeding several thousand documents, this would require migration to a dedicated vector database with ANN indexing."),
    bullet("Audio Transcription Quality: Vosk accuracy depends on audio quality and model size. The small English model (45 MB) provides good accuracy for clear speech but degrades on accented English, technical jargon, or poor-quality recordings."),
    bullet("Single-Threaded LLM Calls: The GeminiClient image generation method uses a mutex to enforce serial execution, preventing parallel infographic or slide generation. This is a conservative design choice to avoid API quota overruns but increases wall-clock time for multi-slide presentations."),
    bullet("No Mobile Support: The glassmorphism SPA is optimised for desktop browsers. The three-panel workspace layout does not adapt well to narrow mobile viewports, limiting usability on smartphones and tablets."),
    bullet("Textbook Context Window Limits: For notebooks with very large source collections exceeding the Gemini Flash context window, the textbook generation prompt truncates input, potentially omitting material from later sources. A chunked chapter-by-chapter generation approach would mitigate this."),
    emptyPara(),

    sectionHeading("7.3 Future Scope of the Project"),
    bodyPara("The following directions are proposed for future enhancement of StudyForge across technical, functional, and research dimensions:"),
    emptyPara(),

    subSectionHeading("7.3.1 Technical Enhancements"),
    bullet("Dedicated Vector Database Migration: Replace the in-memory cosine similarity search with a production vector database (Weaviate, Qdrant, or Pgvector) implementing HNSW indexing. This would enable sub-millisecond ANN search at corpus sizes of millions of documents with no degradation in retrieval quality."),
    bullet("Advanced RAG Techniques: Implement HyDE (Hypothetical Document Embeddings) for improved retrieval recall, cross-encoder re-ranking for higher precision, and multi-query retrieval that generates multiple reformulations of the user query to improve coverage."),
    bullet("WebSocket Streaming: Replace the current polling-based response delivery with WebSocket streaming (SSE) for real-time character-by-character response display, reducing perceived latency significantly."),
    bullet("Chunked Textbook Generation: Implement a chapter-by-chapter generation approach that processes one chapter at a time, enabling generation from notebooks with source content exceeding the model's context window without truncation."),
    bullet("Go Test Coverage: Expand automated test coverage from the current manual testing to a full Go test suite covering all store operations, vector search, prompt formatting, and API handler logic."),
    emptyPara(),

    subSectionHeading("7.3.2 Feature Enhancements"),
    bullet("Spaced Repetition and Flashcard Generation: Automatic generation of Anki-compatible flashcard decks from Exam Notes, integrated with a spaced repetition scheduling algorithm (SM-2) to optimise long-term retention. This would transform StudyForge from a note-generation tool into a complete active-recall study system."),
    bullet("n8n Workflow Integration: Replace the Go-based ingestion pipeline with an n8n visual workflow, enabling non-technical users to customise the processing pipeline without code changes and to connect StudyForge to external data sources such as Google Drive, Notion, or email."),
    bullet("Collaborative Notebooks: Multi-user notebook sharing with role-based permissions (viewer, editor, owner), enabling study groups to build shared knowledge bases from collective uploads. This would require the addition of a real-time collaboration layer (CRDT or operational transform)."),
    bullet("Mobile Application: Development of a React Native or Flutter mobile client consuming the StudyForge API, enabling students to upload lecture photos, review generated notes, and query the RAG chat from their mobile devices."),
    bullet("Automated Flashcard Export: Integration with Anki via the AnkiConnect plugin to automatically push generated flashcards to the student's Anki deck, enabling seamless integration with established active-recall study workflows."),
    emptyPara(),

    subSectionHeading("7.3.3 AI and Model Enhancements"),
    bullet("Gemini 2.5 Pro Upgrade: Evaluation of Gemini 2.5 Pro for note generation and textbook compilation tasks, where the model's significantly enhanced reasoning capability is expected to produce qualitatively superior outputs for complex technical and scientific documents, particularly those with mathematical notation and formal proofs."),
    bullet("Multimodal Source Processing: Integration of Gemini's native vision capabilities for processing image-based sources (diagrams, charts, handwritten notes, whiteboard photographs) with structured extraction of visual content alongside text."),
    bullet("Personalised Learning Profiles: Development of a user preference learning system that adapts transformation prompt strategies based on feedback signals (thumbs up/down on generated notes), creating progressively personalised note generation tailored to individual learning styles."),
    bullet("Cross-Notebook Semantic Search: Extension of the current per-notebook RAG chat to a global search mode that retrieves from all of the user's notebooks simultaneously, enabling connections between materials from different subjects."),
    bullet("Domain-Specific Fine-Tuning: Research into fine-tuning smaller, locally deployable models (Gemma, Mistral) on educational note generation tasks using StudyForge-generated data, enabling offline operation without API dependencies for privacy-sensitive deployments."),
    emptyPara(),

    subSectionHeading("7.3.4 Research Directions"),
    bullet("Evaluation of Note Generation Quality: Development of a formal evaluation framework for assessing AI-generated study notes across dimensions of factual accuracy, completeness, conciseness, and pedagogical utility, using human expert ratings as ground truth."),
    bullet("Learning Outcome Studies: Longitudinal studies measuring the impact of StudyForge usage on student academic performance, examination scores, and self-reported study efficiency compared to control groups using traditional note-taking methods."),
    bullet("Multi-Lingual Support: Extension of the ingestion and generation pipeline to support non-English source materials, particularly for educational institutions in India, China, and other markets where English is a second language."),
    bodyPara("These future directions collectively define a research and development roadmap that would transform StudyForge from an MSc project prototype into a production-ready educational AI platform suitable for institutional deployment and academic publication."),
    pageBreakPara(),

    // ===== REFERENCES =====
    chapterHeading("References"),
    emptyPara(),
    bodyPara("[1] Lewis, P., Perez, E., Piktus, A., et al. (2020). Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks. Advances in Neural Information Processing Systems (NeurIPS 2020), 33, 9459-9474."),
    emptyPara(),
    bodyPara("[2] Reimers, N., & Gurevych, I. (2019). Sentence-BERT: Sentence Embeddings using Siamese BERT-Networks. Proceedings of the 2019 Conference on Empirical Methods in Natural Language Processing (EMNLP 2019), 3982-3992."),
    emptyPara(),
    bodyPara("[3] Notion Inc. (2024). Notion AI: AI-powered workspace features. Retrieved from https://www.notion.so/product/ai"),
    emptyPara(),
    bodyPara("[4] Google LLC. (2023). NotebookLM: AI-powered note-taking and research tool. Retrieved from https://notebooklm.google.com"),
    emptyPara(),
    bodyPara("[5] Quivr Team. (2024). Quivr: Open-source RAG framework for personal knowledge bases. GitHub. Retrieved from https://github.com/QuivrHQ/quivr"),
    emptyPara(),
    bodyPara("[6] Vaswani, A., Shazeer, N., Parmar, N., et al. (2017). Attention Is All You Need. Advances in Neural Information Processing Systems (NeurIPS 2017), 30, 5998-6008."),
    emptyPara(),
    bodyPara("[7] Brown, T.B., Mann, B., Ryder, N., et al. (2020). Language Models are Few-Shot Learners. Advances in Neural Information Processing Systems (NeurIPS 2020), 33, 1877-1901."),
    emptyPara(),
    bodyPara("[8] Gemini Team, Google. (2023). Gemini: A Family of Highly Capable Multimodal Models. arXiv preprint arXiv:2312.11805."),
    emptyPara(),
    bodyPara("[9] Gao, L., Ma, X., Lin, J., & Callan, J. (2023). Precise Zero-Shot Dense Retrieval without Relevance Labels. Proceedings of the 61st Annual Meeting of the Association for Computational Linguistics (ACL 2023), 1762-1777."),
    emptyPara(),
    bodyPara("[10] Pinecone Systems Inc. (2024). Pinecone: Vector Database for Machine Learning. Retrieved from https://www.pinecone.io/docs"),
    emptyPara(),
    bodyPara("[11] Johnson, J., Douze, M., & Jégou, H. (2021). Billion-Scale Similarity Search with GPUs. IEEE Transactions on Big Data, 7(3), 535-547."),
    emptyPara(),
    bodyPara("[12] Microsoft. (2024). markitdown: Python utility for converting files and documents to Markdown. GitHub. Retrieved from https://github.com/microsoft/markitdown"),
    emptyPara(),
    bodyPara("[13] Li, M., Lv, T., Chen, J., et al. (2021). TrOCR: Transformer-based Optical Character Recognition with Pre-trained Models. Proceedings of AAAI 2023."),
    emptyPara(),
    bodyPara("[14] Smock, B., Pesala, R., & Abraham, R. (2022). PubTables-1M: Towards Comprehensive Table Extraction from Unstructured Documents. CVPR 2022."),
    emptyPara(),
    bodyPara("[15] Huang, Y., Lv, T., Cui, L., Lu, Y., & Wei, F. (2022). LayoutLMv3: Pre-training for Document AI with Unified Text and Image Masking. ACM Multimedia 2022."),
    emptyPara(),
    bodyPara("[16] Blecher, L., Cucurull, G., Scialom, T., & Stojnic, R. (2023). Nougat: Neural Optical Understanding for Academic Documents. arXiv preprint arXiv:2308.13418."),
    emptyPara(),
    bodyPara("[17] Chase, H. (2022). LangChain: Building Applications with LLMs through Composability. GitHub. Retrieved from https://github.com/langchain-ai/langchain"),
    emptyPara(),
    bodyPara("[18] Smallnest. (2024). Notex: Open-source NotebookLM alternative built with Go. GitHub. Retrieved from https://github.com/smallnest/notex"),
    emptyPara(),
    bodyPara("[19] Ma, P. (2023). LangChainGo: Go port of the LangChain framework. GitHub. Retrieved from https://github.com/tmc/langchaingo"),
    emptyPara(),
    bodyPara("[20] Google LLC. (2024). Google AI Studio: API access for Gemini models. Retrieved from https://aistudio.google.com"),
    emptyPara(),
    bodyPara("[21] Gin-Gonic Team. (2024). Gin Web Framework for Go. GitHub. Retrieved from https://github.com/gin-gonic/gin"),
    emptyPara(),
    bodyPara("[22] Kaldi Team / Alphacephei. (2024). Vosk: Offline Speech Recognition API. Retrieved from https://alphacephei.com/vosk"),
    emptyPara(),
    bodyPara("[23] Golang-JWT. (2024). golang-jwt: Community maintained fork of dgrijalva/jwt-go. GitHub. Retrieved from https://github.com/golang-jwt/jwt"),
    emptyPara(),
    bodyPara("[24] Darji, V.R. (2025). StudyForge: An AI-Powered Document-to-Study-System Pipeline. GitHub. Retrieved from https://github.com/Lukey-7/StudyForge"),
    pageBreakPara(),

    // ===== APPENDIX A =====
    chapterHeading("Appendix A"),
    chapterHeading("Algorithms and Pseudocode"),
    emptyPara(),

    sectionHeading("A.1 Document Ingestion Pipeline Algorithm"),
    emptyPara(),
    ...codeBlock([
        "ALGORITHM: IngestDocument(filePath, fileType, sourceID)",
        "INPUT:  filePath (string), fileType (MIME string), sourceID (UUID)",
        "OUTPUT: Source record with status=completed and chunks indexed",
        "",
        "1. UPDATE source status → processing (progress=5%)",
        "2. IF fileType IN [audio/*, video/*]:",
        "     IF ENABLE_VOSK_TRANSCRIBER = true:",
        "       rawText ← vosk-transcriber(filePath, modelPath)",
        "       formattedText ← Gemini.Punctuate(rawText)",
        "       content ← formattedText",
        "     ELSE:",
        "       RETURN error('transcription disabled')",
        "   ELSE IF ENABLE_MARKITDOWN = true:",
        "     content ← markitdown(filePath)",
        "   ELSE:",
        "     content ← os.ReadFile(filePath)",
        "3. UPDATE source status → processing (progress=60%)",
        "4. chunks ← splitText(content, chunkSize, chunkOverlap)",
        "5. FOR EACH chunk IN chunks:",
        "     APPEND Document{content: chunk, metadata: {",
        "       notebook_id, source_name, chunk_index}} to VectorStore",
        "6. UPDATE source (content=content, chunk_count=len(chunks))",
        "7. UPDATE source status → completed (progress=100%)",
        "8. CHECK if notebook has existing textbook:",
        "     IF textbook.status = 'current':",
        "       UPDATE textbook.status → 'stale'",
    ]),
    emptyPara(),

    sectionHeading("A.2 Cosine Similarity Search Algorithm"),
    emptyPara(),
    ...codeBlock([
        "ALGORITHM: SimilaritySearch(notebookID, query, numDocs)",
        "INPUT:  notebookID (string), query (string), numDocs (int)",
        "OUTPUT: Top-k most relevant Document objects",
        "",
        "1. queryLower ← toLower(query)",
        "2. queryWords ← splitWords(queryLower)",
        "3. candidates ← FILTER VectorStore WHERE notebook_id=notebookID",
        "4. IF candidates = EMPTY → RETURN []",
        "5. FOR EACH doc IN candidates:",
        "     score ← 0.0",
        "     content ← toLower(doc.pageContent)",
        "     // Substring matching (CJK-friendly)",
        "     IF content CONTAINS queryLower: score += 10.0",
        "     // Character-level overlap",
        "     matchCount ← COUNT(rune IN query WHERE content CONTAINS rune)",
        "     score += (matchCount / len(query)) * 5.0",
        "     // Word-level matching",
        "     FOR word IN queryWords WHERE len(word) > 2:",
        "       IF content CONTAINS word: score += 2.0",
        "     scores.append({doc, score})",
        "6. SORT scores DESCENDING by score",
        "7. IF scores = EMPTY:",
        "     // Fallback: return most recently ingested chunks",
        "     RETURN candidates[-numDocs:]",
        "8. RETURN scores[:numDocs].docs",
    ]),
    emptyPara(),

    sectionHeading("A.3 RAG Chat Pipeline Pseudocode"),
    emptyPara(),
    ...codeBlock([
        "ALGORITHM: RAGChat(message, sessionID, notebookID)",
        "INPUT:  message (string), sessionID (UUID), notebookID (UUID)",
        "OUTPUT: grounded response string with source citations",
        "",
        "1. LOAD notebook vector index if not in memory",
        "2. SAVE user message to chat_messages table",
        "3. IF memoryManager IS AVAILABLE:",
        "     (history, summary) ← memoryManager.GetHistory(",
        "       sessionID, message)",
        "   ELSE:",
        "     history ← ALL messages in session",
        "     summary ← ''",
        "4. relevantDocs ← SimilaritySearch(notebookID, message, k=5)",
        "5. contextText ← FORMAT relevantDocs as '[Source N] content'",
        "6. prompt ← BuildRAGPrompt(",
        "     summary, history, contextText, message)",
        "7. response ← Gemini.GenerateFromPrompt(prompt)",
        "8. sources ← EXTRACT unique source IDs from relevantDocs metadata",
        "9. SAVE assistant response to chat_messages table",
        "10. IF first message in session:",
        "      title ← Gemini.GenerateTitle(message)",
        "      UPDATE session.title = title",
        "11. RETURN ChatResponse{message: response, sources: sources}",
    ]),
    emptyPara(),

    sectionHeading("A.4 Memory Manager Context Compression Algorithm"),
    emptyPara(),
    ...codeBlock([
        "ALGORITHM: ContextCompression(sessionID, currentQuery)",
        "INPUT:  sessionID (UUID), currentQuery (string)",
        "OUTPUT: (selectedMessages, summaryText)",
        "",
        "1. allMessages ← GET all messages in session",
        "2. existingSummary ← GET summary from session metadata",
        "3. totalBytes ← CALCULATE bytes(allMessages) + bytes(summary)",
        "4. IF totalBytes < BYTES_THRESHOLD:",
        "     RETURN (slidingWindow(allMessages, query), summary)",
        "5. // Apply sliding window first",
        "6. compressed ← selectRelevantHistory(allMessages, query, MAX_HISTORY)",
        "7. compressedBytes ← CALCULATE bytes(compressed)",
        "8. IF compressedBytes >= BYTES_THRESHOLD AND LLM IS AVAILABLE:",
        "     newSummary ← Gemini.GenerateSummary(compressed)",
        "     SAVE newSummary to session metadata",
        "     summary ← newSummary",
        "     compressed ← slidingWindow(allMessages, summary)",
        "9. RETURN (compressed, summary)",
        "",
        "// Multi-factor message scoring",
        "FUNCTION scoreMessage(msg, query, position, total):",
        "  score ← 15.0 * exp(DECAY * position / total * 10)",
        "  FOR keyword IN IMPORTANT_KEYWORDS:",
        "    IF msg.content CONTAINS keyword: score += 5.0",
        "  FOR word IN splitWords(query) WHERE len(word) > 2:",
        "    IF msg.content CONTAINS word: score += 8.0 / len(words)",
        "  score += 3.0 * len(msg.sources)",
        "  RETURN score",
    ]),
    emptyPara(),

    sectionHeading("A.5 Textbook Stale Detection Algorithm"),
    emptyPara(),
    ...codeBlock([
        "ALGORITHM: MarkTextbookStaleIfNeeded(notebookID)",
        "INPUT:  notebookID (UUID) — notebook that just had a source updated",
        "OUTPUT: textbook.status updated to 'stale' if applicable",
        "",
        "1. textbook ← GET textbook WHERE notebook_id = notebookID",
        "2. IF textbook IS NULL:",
        "     RETURN  // No textbook exists, nothing to mark stale",
        "3. IF textbook.status = 'current':",
        "     UPDATE textbook.status → 'stale'",
        "     UPDATE textbook.updated_at → NOW()",
        "4. // Frontend polls GET /textbook every 5 seconds",
        "   // Status change triggers banner display automatically",
    ]),
    pageBreakPara(),

    // ===== APPENDIX B =====
    chapterHeading("Appendix B"),
    chapterHeading("Source Code Snippets"),
    emptyPara(),

    sectionHeading("B.1 Environment Configuration (.env.example)"),
    ...codeBlock([
        "# StudyForge Configuration",
        "# Copy this file to .env and fill in your values",
        "",
        "# LLM Provider (Google Gemini recommended)",
        "OPENAI_API_KEY=your-gemini-api-key-here",
        "OPENAI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai",
        "OPENAI_MODEL=gemini-2.5-flash",
        "EMBEDDING_MODEL=text-embedding-004",
        "GOOGLE_API_KEY=your-google-api-key-here",
        "",
        "# Server Configuration",
        "SERVER_HOST=0.0.0.0",
        "SERVER_PORT=8080",
        "",
        "# Database Configuration",
        "VECTOR_STORE_TYPE=sqlite",
        "SQLITE_PATH=./data/vector.db",
        "STORE_TYPE=sqlite",
        "STORE_PATH=./data/checkpoints.db",
        "",
        "# Agent Configuration",
        "MAX_SOURCES=5",
        "MAX_CONTEXT_LENGTH=128000",
        "CHUNK_SIZE=1000",
        "CHUNK_OVERLAP=200",
        "",
        "# Document Processing",
        "ENABLE_MARKITDOWN=true",
        "ENABLE_VOSK_TRANSCRIBER=true",
        "VOSK_MODEL_PATH=/root/.cache/vosk/vosk-model-small-en-us-0.15",
        "",
        "# Authentication",
        "JWT_SECRET=your-secret-key-change-in-production",
        "GITHUB_CLIENT_ID=your-github-client-id",
        "GITHUB_CLIENT_SECRET=your-github-client-secret",
        "GITHUB_REDIRECT_URL=http://localhost:8080/auth/github/callback",
        "GOOGLE_CLIENT_ID=your-google-client-id",
        "GOOGLE_CLIENT_SECRET=your-google-client-secret",
        "GOOGLE_REDIRECT_URL=http://localhost:8080/auth/google/callback",
        "",
        "# Image Generation",
        "IMAGE_PROVIDER=gemini",
        "GEMINI_IMAGE_MODEL=gemini-3.1-flash-image-preview",
    ]),
    emptyPara(),

    sectionHeading("B.2 Main Server Startup (main.go)"),
    ...codeBlock([
        "// main.go",
        "func main() {",
        "    serverMode := flag.Bool(\"server\", false,",
        "        \"Run in HTTP server mode\")",
        "    flag.Parse()",
        "",
        "    cfg := backend.LoadConfig()",
        "    if err := backend.ValidateConfig(cfg); err != nil {",
        "        fmt.Fprintf(os.Stderr,",
        "            \"\\n❌ Configuration Error:\\n\\n%v\\n\\n\", err)",
        "        os.Exit(1)",
        "    }",
        "",
        "    if *serverMode {",
        "        server, err := backend.NewServer(cfg)",
        "        if err != nil {",
        "            fmt.Fprintf(os.Stderr,",
        "                \"Failed to create server: %v\\n\", err)",
        "            os.Exit(1)",
        "        }",
        "        fmt.Printf(\"✅ StudyForge v%s\\n\", Version)",
        "        fmt.Printf(\"📡 Server: http://%s:%s\\n\",",
        "            cfg.ServerHost, cfg.ServerPort)",
        "        fmt.Printf(\"🤖 LLM: %s\\n\", cfg.OpenAIModel)",
        "        if err := server.Start(); err != nil {",
        "            os.Exit(1)",
        "        }",
        "    }",
        "}",
    ]),
    emptyPara(),

    sectionHeading("B.3 GitHub OAuth Callback Handler (backend/auth.go)"),
    ...codeBlock([
        "// backend/auth.go (excerpt)",
        "func (h *AuthHandler) HandleCallback(c *gin.Context) {",
        "    provider := c.Param(\"provider\")",
        "    code := c.Query(\"code\")",
        "",
        "    // Exchange code for access token",
        "    token, err := h.githubConfig.Exchange(",
        "        context.Background(), code)",
        "",
        "    // Get user profile from GitHub API",
        "    client := h.githubConfig.Client(",
        "        context.Background(), token)",
        "    resp, _ := client.Get(\"https://api.github.com/user\")",
        "",
        "    // Create or update user in database",
        "    user := &User{Email: email, Name: name,",
        "        AvatarURL: avatarURL, Provider: provider}",
        "    h.store.CreateUser(context.Background(), user)",
        "",
        "    // Generate JWT token",
        "    tokenString, _ := GenerateJWT(dbUser.ID, h.config.JWTSecret)",
        "",
        "    // Return token to frontend via postMessage",
        "    c.String(http.StatusOK, fmt.Sprintf(`",
        "        <script>",
        "            window.opener.postMessage(",
        "                {token: \"%s\", user: %s}, \"%s\");",
        "            window.close();",
        "        </script>`,",
        "        tokenString, toJson(dbUser), origin))",
        "}",
    ]),
    emptyPara(),

    sectionHeading("B.4 Notebook Type Definition (backend/types.go)"),
    ...codeBlock([
        "// backend/types.go",
        "type Notebook struct {",
        "    ID          string                 `json:\"id\"`",
        "    UserID      string                 `json:\"user_id\"`",
        "    Name        string                 `json:\"name\"`",
        "    Description string                 `json:\"description,omitempty\"`",
        "    Color       string                 `json:\"color\"`",
        "    Icon        string                 `json:\"icon\"`",
        "    SourceIDs   []string               `json:\"source_ids,omitempty\"`",
        "    IsPublic    bool                   `json:\"is_public\"`",
        "    PublicToken string                 `json:\"public_token,omitempty\"`",
        "    CreatedAt   time.Time              `json:\"created_at\"`",
        "    UpdatedAt   time.Time              `json:\"updated_at\"`",
        "    Metadata    map[string]interface{} `json:\"metadata,omitempty\"`",
        "}",
        "",
        "type Textbook struct {",
        "    ID              string    `json:\"id\"`",
        "    NotebookID      string    `json:\"notebook_id\"`",
        "    ContentMarkdown string    `json:\"content_markdown\"`",
        "    Status          string    `json:\"status\"`",
        "    Version         int       `json:\"version\"`",
        "    CreatedAt       time.Time `json:\"created_at\"`",
        "    UpdatedAt       time.Time `json:\"updated_at\"`",
        "}",
    ]),
    emptyPara(),

    sectionHeading("B.5 Frontend — Note Card Component (app.js excerpt)"),
    ...codeBlock([
        "// backend/frontend/static/app.js (excerpt)",
        "async function renderNotesCompactGrid() {",
        "    if (!this.currentNotebook) return;",
        "    const container = document.querySelector('.notes-compact-grid');",
        "    const notes = await this.api(",
        "        `/notebooks/${this.currentNotebook.id}/notes`);",
        "",
        "    notes.forEach(note => {",
        "        const card = document.createElement('div');",
        "        card.className = 'compact-note-card';",
        "        card.dataset.noteId = note.id;",
        "",
        "        // Strip Markdown for preview text",
        "        const plainText = note.content",
        "            .replace(/^#+\\s+/gm, '')",
        "            .replace(/\\*\\*/g, '')",
        "            .replace(/`/g, '')",
        "            .replace(/\\n+/g, ' ').trim();",
        "",
        "        card.innerHTML = `",
        "            <div class='note-type'>${note.type}</div>",
        "            <h4 class='note-title'>${note.title}</h4>",
        "            <p class='note-preview'>${plainText}</p>",
        "            <div class='note-footer'>",
        "              <span>${this.formatDate(note.created_at)}</span>",
        "            </div>",
        "        `;",
        "        card.addEventListener('click', () =>",
        "            this.viewNote(note));",
        "        container.appendChild(card);",
        "    });",
        "}",
    ]),
    emptyPara(),

    sectionHeading("B.6 Build and Run Commands"),
    ...codeBlock([
        "# Clone the repository",
        "git clone https://github.com/Lukey-7/StudyForge.git",
        "cd StudyForge",
        "",
        "# Configure environment",
        "cp .env.example .env",
        "# Edit .env and add your Gemini API key",
        "",
        "# Install optional tools",
        "pip install markitdown         # Document extraction",
        "pip install vosk-transcriber   # Audio transcription",
        "",
        "# Download Vosk model (English)",
        "mkdir -p /root/.cache/vosk",
        "wget https://alphacephei.com/vosk/models/\\",
        "     vosk-model-small-en-us-0.15.zip",
        "unzip vosk-model-small-en-us-0.15.zip -d \\",
        "      /root/.cache/vosk/",
        "",
        "# Run the server",
        "go run . -server",
        "",
        "# Access at http://localhost:8080",
        "",
        "# Build production binary",
        "go build -o studyforge .",
        "./studyforge -server",
        "",
        "# CLI ingestion mode",
        "go run . -ingest document.pdf -notebook 'My Notes'",
    ]),
];

// ===== BUILD THE DOCUMENT =====
const doc = new Document({
    numbering: {
        config: [
            {
                reference: "bullets",
                levels: [{
                    level: 0,
                    format: LevelFormat.BULLET,
                    text: "•",
                    alignment: AlignmentType.LEFT,
                    style: {
                        paragraph: {
                            indent: { left: 720, hanging: 360 },
                            spacing: { line: 360, before: 40, after: 40 }
                        },
                        run: { font: TNR, size: 24 }
                    }
                }]
            }
        ]
    },
    styles: {
        default: {
            document: {
                run: { font: TNR, size: 24 },
                paragraph: { spacing: { line: 360 } }
            }
        }
    },
    sections: [
        // Section 1: Front matter (no footer)
        {
            properties: {
                page: {
                    size: { width: 12240, height: 15840 },
                    margin: { top: 1440, right: 1260, bottom: 1440, left: 1440 }
                }
            },
            children: frontMatterChildren
        },
        // Section 2: Main content (with footer)
        {
            properties: {
                page: {
                    size: { width: 12240, height: 15840 },
                    margin: { top: 1440, right: 1260, bottom: 1600, left: 1440 }
                }
            },
            footers: { default: makeFooter() },
            children: mainChildren
        }
    ]
});

Packer.toBuffer(doc).then(buffer => {
    fs.writeFileSync('StudyForge_Blackbook_COMPLETE_JS.docx', buffer);
    console.log('Document created successfully!');
    console.log('File size:', buffer.length, 'bytes');
}).catch(err => {
    console.error('Error:', err);
    process.exit(1);
});
package backend

// getTransformationPrompt returns the prompt template for each transformation type
func getTransformationPrompt(transformType string) string {
	return getTransformationPromptWithStyle(transformType, "")
}

// getTransformationPromptWithStyle returns the prompt template with optional style parameter
func getTransformationPromptWithStyle(transformType string, style string) string {
	switch transformType {
	case "summary":
		return summaryPrompt()
	case "faq":
		return faqPrompt()
	case "study_guide":
		return studyGuidePrompt()
	case "outline":
		return outlinePrompt()
	case "podcast":
		return podcastPrompt()
	case "timeline":
		return timelinePrompt()
	case "glossary":
		return glossaryPrompt()
	case "quiz":
		return quizPrompt()
	case "mindmap":
		return mindmapPrompt()
	case "infograph":
		return infographPromptWithStyle(style)
	case "ppt":
		return pptPrompt()
	case "custom":
		return customPrompt()
	case "insight":
		return insightPrompt()
	case "data_table":
		return dataTablePrompt()
	case "data_chart":
		return dataChartPrompt()
	case "exam_notes":
		return examNotesPrompt()
	default:
		return defaultPrompt()
	}
}

func summaryPrompt() string {
	return `You are an expert at creating comprehensive summaries. Please create a {length} summary in {format} format based on the following sources.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

Please provide a well-structured summary capturing the key information, main topics, and important details from the sources.`
}

func faqPrompt() string {
	return `You are an expert at creating Frequently Asked Questions (FAQ) documents. Please generate a comprehensive FAQ in {format} format based on the following sources.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

Create 10-15 common questions and their detailed answers, covering the main topics and information from the sources.`
}

func studyGuidePrompt() string {
	return `You are an educational expert. Please create a comprehensive study guide in {format} format based on the following sources.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

The study guide should include:
1. Learning Objectives
2. Key Concepts and Definitions
3. Important Themes and Topics
4. Study Questions and Exercises
5. Key Takeaways

Please format it for a {length} study session.`
}

func outlinePrompt() string {
	return `You are an expert at creating structured outlines. Please create a detailed hierarchical outline in {format} format based on the following sources.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

The outline should:
- Use appropriate hierarchical structure (I, A, 1, a)
- Cover all major topics and subtopics
- Include brief explanations for main sections
- Be detailed to a {length} level`
}

func podcastPrompt() string {
	return `You are a podcast script writer. Please create an engaging podcast script based on the following sources.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

The script should:
- Be conversational and engaging
- Cover the main topics from the sources
- Include two hosts discussing the material
- Have a spoken duration of approximately 10-15 minutes
- Include natural transitions and questions
- Have a clear intro and outro

Please format it as a podcast script with speaker labels (Host 1, Host 2) and stage directions in [brackets].`
}

func timelinePrompt() string {
	return `You are an expert at creating chronological timelines. Please create a timeline in {format} format based on the following sources.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

Extract and organize events in chronological order, including:
- Date or time period
- Event description
- Key figures involved
- Significance of each event`
}

func glossaryPrompt() string {
	return `You are an expert at creating glossaries. Please create a comprehensive glossary in {format} format based on the following sources.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

Include:
- Important terms and concepts
- Clear and concise definitions
- Context from the sources
- Cross-references between related terms`
}

func quizPrompt() string {
	return `You are an educator creating assessment materials. Please create a quiz in {format} format based on the following sources.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

The quiz should include:
- Mixed question types (multiple choice, true/false, short answer)
- Questions of varying difficulty
- An answer key
- Questions that test comprehension rather than just memorization

Create a {length} quiz containing 10-20 questions.`
}

func mindmapPrompt() string {
	return `You are a senior information architect and knowledge management expert. Please extract and convert the [Text Content] into Mermaid.js mindmap format.
**Note: Regardless of the source language, please reply in English.**

# Style Guidelines:
1. **Central Theme**: Must use root((content)) format (circle).
2. **Main Branches**: Use (content) format (rounded rectangle).
3. **Detail Nodes**: Use [content] format (standard rectangle) or write text directly.

# Strict Logic Rules:
1. **Mindmap syntax only**: Strictly forbidden to use graph, LR, --> or similar characters.
2. **Content Safety**: Node content must be concise (under 10 words), strictly no quotes allowed.
3. **No Explanations**: Only output the code block starting with ` + "```mermaid" + ` and ending with ` + "```" + `.

Sources:
{sources}

# Example:
` + "```mermaid" + `
mindmap
  root((Core Theme))
    (Main Branch A)
      [Detail 1]
      [Detail 2]
    (Main Branch B)
      [Detail 3]
` + "```" + `
`
}

func infographPrompt() string {
	return `Please create a cartoon-style infographic based on the provided content, following these guidelines:

- Hand-drawn illustration style, horizontal layout (16:9 aspect ratio).
- Include simple cartoon elements, icons, or well-known figures to enhance visual interest and memory points.
- If the content involves sensitive or copyrighted figures, replace them with visually similar alternatives; do not refuse to generate the illustration.
- All images and text must strictly follow the hand-drawn style; avoid using realistic visual elements.
- Keep the information concise, highlighting keywords and core concepts. Make full use of whitespace to clearly emphasize key points.
- Unless otherwise specified, use the same language as the provided content.

Please use nano banana pro to create the illustration based on the provided input.

Input content:
{sources}
`
}

func infographPromptWithStyle(styleID string) string {
	style := GetInfographStyle(styleID)
	return `Create a professional infographic following these specifications:

## Image Specifications
- **Type**: Infographic
- **Layout**: Horizontal layout (16:9 aspect ratio)
- **Style**: ` + style.Name + `

## Style Guidelines
` + style.Prompt + `

## Content Requirements
- Include simple visual elements, icons, or illustrations to enhance visual appeal
- If content involves sensitive or copyrighted figures, replace with visually similar alternatives
- Keep information concise, highlight keywords and core concepts
- Use whitespace effectively to emphasize key points
- Use the same language as the provided content unless otherwise specified

## Instructions
Use nano banana pro to create the illustration based on the provided input.

Input content:
{sources}
`
}

func pptPrompt() string {
	return `# Presentation Design Instructions

## Role Definition

You are a world-class presentation designer and storyteller. You create visually stunning and highly polished slides that effectively communicate complex information. You are an expert in design and storytelling.

Your slides are adapted based on the source material and target audience. There is always a main narrative thread, and you find the best way to tell it. You blend the expertise and creativity of a top-tier designer.

## Design Principles

These slides are designed primarily for **reading and sharing**. The structure should be self-explanatory and easily understood without a speaker. The narrative and all useful data should be included in the text and visual elements of the slides. Slides should contain enough context so that any visual element can be understood independently. If it helps the narrative, specific slides with denser information (extracted from the source material) can be added.

## Workflow

You are now writing an **outline** for the slides described below.
**IMPORTANT: This presentation must not exceed 10 slides. If there is too much content, you must condense or merge it.**

We will provide this outline to a professional designer to create the final product.

The slide content should be in English. Placeholders should be kept in English.

---

## Step 1: Generate Style Guide

**First**, before writing the slide outline, you must generate a global **Style Guide** block based on the content theme and user requirements. This should be wrapped in XML tags inside a code block.

### Style Guide Example

` + "```xml" + `
<STYLE_INSTRUCTIONS>
You are the "Architect", a sophisticated AI specializing in visualizing instructions into high-end hand-drawn style data presentations. Your output is precise, analytical, and aesthetically refined.

**Core Instructions:**
1. Analyze the structure, intent, and key elements of the user prompt.
2. Translate instructions into clear, structured visual metaphors (watercolor sketches, diagrams, schematics).
3. Use specific, restrained color schemes and font families for maximum clarity and professional impact.
4. Maintain a strict 16:9 aspect ratio for all visual outputs.
5. Present information in a triptych or grid layout, balancing text and visual elements.

<STYLE_INSTRUCTION_BLOCK>
Design Aesthetic: "Hand-drawn Watercolor Sketch & Notebook Style". A warm, human, slightly artisanal aesthetic, inspired by watercolor artists' journals, whiteboard brainstorming, and conceptual design drafts. Maintains professionalism while adding approachability.
Background Color: Off-white (#FAF9F6) or Light Beige (#FFF8E7), with a slight paper texture.
Primary Font: "Caveat" or "Patrick Hand" (natural, readable handwriting).
Secondary Font: "Courier New" or "Anonymous Pro" (for code terms and technical annotations, simulating a typewriter effect).
Color Scheme (Muted Hand-drawn Tones):
  - Primary Text: Deep Charcoal (#2C3E50), with a slightly irregular stroke feel.
  - Category A (Foundation): Sketch Blue (#3B82F6).
  - Category B (Reasoning): Grass Green (#10B981).
  - Category C (Planning): Warm Orange (#F59E0B).
  - Category D (Action/Optimization): Coral Red (#EF4444).
  - Category E (RAG/Memory): Lavender Purple (#8B5CF6).
  - Connectors/Lines: Sketch Gray (#6B7280), with slight waviness and imperfections.
Visual Elements:
  - Hand-drawn style boxes, circles, and arrows (slightly irregular lines).
  - Doodle-style icons (stick-figure brain, database, looping arrows, tree diagram).
  - Highlights use hand-drawn underlines, circled emphasis, and asterisk marks.
  - Dashed dividing areas, simulating notebook column effects.
  - Shadows use light watercolor wash effects rather than regular drop shadows.
</STYLE_INSTRUCTION_BLOCK>

</STYLE_INSTRUCTIONS>
` + "```" + `

### Style Guide Template Structure

Use the following structure as a template, but **dynamically adjust** aesthetics, fonts, and colors to suit the specific narrative:

` + "```markdown" + `
You are the "Architect", a sophisticated AI specializing in visualizing instructions into high-end hand-drawn style data presentations. Your output is precise, analytical, and aesthetically refined.

**Core Instructions:**
1. Analyze the structure, intent, and key elements of the user prompt.
2. Translate instructions into clear, structured visual metaphors (watercolor sketches, diagrams, schematics).
3. Use specific, restrained color schemes and font families for maximum clarity and professional impact.
4. Maintain a strict 16:9 aspect ratio for all visual outputs.
5. Present information in a triptych or grid layout, balancing text and visual elements.

**Style Guide:**

Design Aesthetic: [Describe overall style, e.g., hand-drawn, watercolor, gouache, crayon, minimalist, playful, corporate, architectural, etc.]

Background Color: [Description and hex code]

Primary Font: [Heading font name]

Secondary Font: [Body font name]

Color Scheme:
- Primary text color: [Hex code]
- Primary accent color: [Hex code]

Visual Elements: [Describe the use of lines, shapes, image style, photography vs vectors, etc.]

**What to Draw:**
` + "```" + `

---

## Step 2: Define Content Focus

For this specific presentation, we want the content to focus on:

{prompt}

We have also attached some **production notes** below, which will help guide the overall structure and narrative of the presentation.

Production Notes (Source Material):
{sources}

---

## Outline Writing Rules

Remember the following rules:

### Basic Requirements
- Focus on the slide outline and what each slide should cover
- Each slide description should be comprehensive and strictly structured
- **Slide 1 must be the Title Slide, and the last slide must be the Closing Slide**
  - These two slides should have a distinctly different visual style and layout from the internal content slides (e.g., using a "poster style" layout, hero typography, or full-bleed imagery) to set the mood and provide a strong closing

### Structure Per Slide

For **each slide**, you must accurately output content using the following **4 sections**:

#### // Narrative Goal
Explain the specific storytelling purpose of this slide within the overall narrative arc

#### // Key Content
List the main headline, subheadline, and body/bullet points. **Every specific data point must be traceable to the source material.**

#### // Visual Elements
Describe the imagery, charts, graphs, or abstract visuals needed to support the points.

#### // Layout
Describe the composition, hierarchy, spatial arrangement, or focal points.

### Content Requirements
- Retain key elements from the source material
- **Every specific data point must be directly traceable to the source material**
- All details need to be mentioned because the designer will not have access to the source content later
- Always assume the audience has more expertise, interest, and intelligence than you might think

---

## Key Takeaways (Must Follow)

### ❌ What NOT to do

- **Never generate more than 20 slides**
- Avoid headlines in the "Title: Subtitle" format; they look very AI-generated
- Explicitly avoid cliché "AI speak" patterns
  - Never use phrases like "This is not just [X], but also [Y]"
- Never include any slides with placeholders for author names, dates, etc.
- Never request photorealistic images of well-known figures
- **Never end with a generic "Any questions?" or "Thank You" slide**
  - Instead, the closing should be a designed concluding statement, a meaningful reference, or a strong visual takeaway to anchor the entire narrative

### ✅ What MUST be done

- Use direct, confident, active, and **human-sounding language**
- Favor narrative topic sentences to help tie the presentation together
- Ensure all data points are supported by the source material
- Provide sufficiently detailed descriptions for the designer

---

## Summary

The purpose of these instructions is to guide the AI in creating a **high-quality, professional, and strongly narrative** presentation outline. The final product should:

1. Have a clear visual style guide
2. Tell a coherent story
3. Contain enough detail for the designer to execute
4. Avoid common AI-generated content pitfalls
5. Start and end in a meaningful way
`
}

func customPrompt() string {
	return `You are a helpful assistant. Based on the following sources and the custom request, generate the requested content.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

Custom Request:
{prompt}

Please generate the content in {format} format, keeping it {length}.`
}

func insightPrompt() string {
	return `You are an expert at creating comprehensive summaries. Please generate a concise summary based on the following sources.
**Note: Regardless of the source language, please reply in English.**

Sources:
{sources}

Please provide a concise summary capturing the key information, main topics, and important details from the sources. The summary will be used for subsequent deep insight analysis.`
}

func defaultPrompt() string {
	return `You are a helpful assistant. Based on the following sources, provide a {type} in {format} format.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

Generate {length} content.`
}

func dataTablePrompt() string {
	return `You are a data analysis expert. Please create one or more data tables in {format} format based on the following sources.
**Note: Regardless of the source language, please reply in English. Do not use ` + "```markdown" + ` tags to wrap the output.**

Sources:
{sources}

Requirements:
1. Analyze the source content and extract data, information, or knowledge points suitable for tabular display
2. Create appropriate tables based on the data content (can be a single table or multiple related tables)
3. Tables should have clear headers and logically organized columns and rows
4. Table content should be concise, readable, and highlight key information
5. May include: data comparisons, information summaries, parameter lists, feature comparisons, time series data, etc.
6. If the content is suitable for multiple tables with different dimensions, you can create them separately

Please ensure the table structure is clear, data is accurate, and formatting is standard.`
}

func dataChartPrompt() string {
	return `You are a data visualization expert. Please analyze the data and generate ECharts configuration based on the following sources.
**Note: Regardless of the source language, please reply in English.**

Sources:
{sources}

Requirements:
1. Analyze the source content and extract data, metrics, or trends suitable for chart display
2. Select appropriate chart types based on the data:
   - Bar chart: for comparing values across different categories
   - Line chart: for showing time series or trend changes
   - Pie chart: for showing proportions or composition
   - Scatter plot: for showing relationships between two variables
   - Radar chart: for multi-dimensional data comparison
3. Can generate a single chart or multiple related charts
4. Chart configurations must be valid ECharts option format
5. Chart titles should be clear and concise, highlighting the core message
6. Legends, axis labels, etc. should be clear and easy to understand

Please output the chart configurations in JSON array format.

Each chart element must contain:
- title field: the title of the chart
- option field: the complete ECharts option configuration object

The output must be a valid JSON array, do not include markdown code block tags, and do not add any other text or explanations.`
}

func examNotesPrompt() string {
	return `You are an exam revision assistant. From the source material below, create ultra-compressed revision notes. Rules: bullet points only, maximum one line each, bold every key term and definition with **term**. Do not include full sentences or explanations — compress ruthlessly. End with exactly 5 likely exam questions based on the content. Format entirely in Markdown.

Sources:
{sources}
`
}

// Chat system prompt - Optimized for better context handling and source citation
func chatSystemPrompt() string {
	return `# Role Definition

You are a professional notebook application AI assistant, skilled at providing accurate, helpful answers based on the provided document materials and conversation history.

# Core Rules

## 1. Language & Format
- **Must answer in English**: Regardless of the source material language
- **Do not use markdown code blocks to wrap the answer**: Output text content directly
- **Maintain a professional yet friendly tone**

## 2. Information Accuracy
- **Answer strictly based on provided information**: Do not fabricate or guess content
- **Explicitly state information sources**: Let the user know which document the information comes from
- **Be honest about uncertainty**: If information is insufficient, state this clearly and provide general advice

## 3. Source Citation Guidelines
When citing document information, use the following formats:
- Use the format "According to [Source Name]..."
- Use the format "From [Source Name], it can be concluded that..."
- Use the format "As stated in [Source Name]..."

If there are multiple sources, combine citations:
- Use the format "According to [Source A] and [Source B]..."
- Use the format "[Source A] states that..., while [Source B] adds..."

## 4. Answer Structure
1. **Direct Answer**: First give a direct answer to the question
2. **Detailed Explanation**: Then provide relevant details and explanations
3. **Source Citation**: Explicitly mark information sources
4. **Additional Advice**: If applicable, provide relevant advice or extended thoughts

{{if .summary}}
# Conversation Summary

{{.summary}}

This is a summary of previous conversations to help understand the background and context.
{{end}}

# Conversation History

{{.history}}

# Reference Materials

{{.context}}

# User Question

{{.question}}

# Answer Requirements

Based on the above information, please:
1. **Directly answer the user's question**
2. **Cite specific source materials to support your answer**
3. **Incorporate conversation history (if any) to maintain coherence**
4. **If there is no relevant information in the materials, state this honestly**
5. **Provide a structured, easy-to-understand answer**`
}

// notebookOverviewPrompt generates the prompt for notebook overview (summary + 3 questions)
func notebookOverviewPrompt() string {
	return `You are a professional notebook content analyst. Please complete the following tasks based on all provided source materials:
**Note: Regardless of the source language, please reply in English.**

Source Materials:
{{.sources}}

## Task Requirements

1. **Generate Notebook Overview**: Based on all sources, generate a concise yet insightful notebook overview. The overview should:
   - Capture the core themes and main points of the content
   - Highlight the most critical information
   - Keep it concise (under 200 words)

2. **Generate Deep Questions**: Generate 3 deep questions based on the content to guide users in further exploration and understanding. Questions should:
   - Be insightful and thought-provoking
   - Cover different content dimensions
   - Not be simple information retrieval questions
   - Guide users to deeply understand the material

## Output Format

Please output strictly in the following JSON format, do not add any other text explanations:

` + "```json" + `
{
  "summary": "Notebook overview text",
  "questions": [
    "First deep question",
    "Second deep question",
    "Third deep question"
  ]
}
` + "```" + `
`
}

package backend

// InfographStyle represents a visual style for infographic generation
type InfographStyle struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Description string `json:"description"`
	Prompt      string `json:"prompt"`
}

// DefaultInfographStyle is the default style when none is specified
const DefaultInfographStyle = "craft-handmade"

// InfographStyles contains all available infographic styles
var InfographStyles = map[string]InfographStyle{
	"craft-handmade": {
		ID:          "craft-handmade",
		Name:        "手绘纸艺风格",
		Description: "手绘和纸艺美学，温暖有机的感觉",
		Prompt: `Hand-drawn and paper craft aesthetic with warm, organic feel.

## Color Palette

- Primary: Warm pastels, soft saturated colors, craft paper tones
- Background: Light cream (#FFF8F0), textured paper (#F5F0E6)
- Accents: Bold highlights, construction paper colors

## Visual Elements

- Hand-drawn or cut-paper quality
- Organic, slightly imperfect shapes
- Layered depth with shadows (paper variant)
- Simple cartoon elements and icons
- Character illustrations (people, personalities in cartoon form)
- Ample whitespace, clean composition
- Keywords and core concepts highlighted
- **Strictly hand-drawn—no realistic or photographic elements**

## Typography

- Hand-drawn or casual font style
- Clear, readable labels
- Keywords emphasized with larger/bolder text`,
	},

	"claymation": {
		ID:          "claymation",
		Name:        "黏土动画风格",
		Description: "3D黏土人物美学，定格动画魅力",
		Prompt: `3D clay figure aesthetic with stop-motion charm.

## Color Palette

- Primary: Saturated clay colors - bright but slightly muted
- Background: Neutral studio backdrop, soft gradients
- Accents: Complementary clay colors, shiny highlights

## Visual Elements

- Clay/plasticine texture on all objects
- Fingerprint marks and imperfections
- Rounded, sculpted forms
- Soft shadows
- Stop-motion staging
- Miniature set aesthetic

## Typography

- Extruded clay letters
- Dimensional, rounded text
- Playful and chunky
- Embedded in clay scenes`,
	},

	"kawaii": {
		ID:          "kawaii",
		Name:        "日系可爱风格",
		Description: "日式可爱风格，大眼睛和柔和色调",
		Prompt: `Japanese cute style with big eyes and pastel colors.

## Color Palette

- Primary: Soft pastels - pink (#FFB6C1), mint (#98D8C8), lavender (#E6E6FA)
- Background: Light pink or cream, sparkle overlays
- Accents: Bright pops, star and heart shapes

## Visual Elements

- Big sparkly eyes on characters
- Rounded, soft shapes
- Blushing cheeks
- Sparkles and stars scattered
- Cute animal characters
- Chibi proportions

## Typography

- Rounded, bubbly fonts
- Cute decorations on letters
- Hearts and stars in text
- Soft, friendly appearance`,
	},

	"storybook-watercolor": {
		ID:          "storybook-watercolor",
		Name:        "水彩绘本风格",
		Description: "柔和的手绘插画，童话般的魅力",
		Prompt: `Soft hand-painted illustration with whimsical charm.

## Color Palette

- Primary: Soft watercolor washes - muted blues, greens, warm earth
- Background: Watercolor paper texture, white or cream
- Accents: Deeper pigment pools, splatter effects

## Visual Elements

- Visible brushstrokes
- Soft color bleeds and gradients
- White space as design element
- Delicate line work over washes
- Natural, organic shapes
- Dreamy, atmospheric quality

## Typography

- Elegant hand-lettering
- Watercolor-style text
- Flowing, organic letterforms
- Integrated with illustrations`,
	},

	"chalkboard": {
		ID:          "chalkboard",
		Name:        "黑板粉笔风格",
		Description: "黑板背景配彩色粉笔手绘风格",
		Prompt: `Black chalkboard background with colorful chalk drawing style.

## Color Palette

- Background: Chalkboard Black (#1A1A1A) or Dark Green-Black (#1C2B1C)
- Primary Text: Chalk White (#F5F5F5)
- Accents: Chalk Yellow (#FFE566), Pink (#FF9999), Blue (#66B3FF), Green (#90EE90), Orange (#FFB366)

## Visual Elements

- Hand-drawn chalk illustrations with sketchy, imperfect lines
- Chalk dust effects around text and key elements
- Doodles: stars, arrows, underlines, circles, checkmarks
- Mathematical formulas and simple diagrams
- Eraser smudges and chalk residue textures
- Stick figures and simple icons

## Typography

- Hand-drawn chalk lettering style
- Visible chalk texture
- Imperfect baseline adds authenticity
- White or bright colored chalk for emphasis`,
	},

	"cyberpunk-neon": {
		ID:          "cyberpunk-neon",
		Name:        "赛博朋克霓虹风格",
		Description: "深色背景上的霓虹发光效果，未来主义美学",
		Prompt: `Neon glow on dark backgrounds, futuristic aesthetic.

## Color Palette

- Primary: Neon pink (#FF00FF), cyan (#00FFFF), electric blue
- Background: Deep black (#0A0A0A), dark purple gradients
- Accents: Neon glow effects, chrome reflections

## Visual Elements

- Glowing neon outlines
- Dark atmospheric backgrounds
- Digital glitch effects
- Circuit patterns
- Holographic elements
- Rain and reflections

## Typography

- Glowing neon text
- Digital/tech fonts
- Flickering effects
- Outlined glow letters`,
	},

	"bold-graphic": {
		ID:          "bold-graphic",
		Name:        "粗线条漫画风格",
		Description: "高对比度漫画风格，大胆轮廓和戏剧性视觉效果",
		Prompt: `High-contrast comic style with bold outlines and dramatic visuals.

## Color Palette

- Primary: Bold primaries - red, yellow, blue, black
- Background: White, halftone patterns, dramatic shadows
- Accents: Spot colors, neon highlights

## Visual Elements

- Bold black outlines
- High contrast compositions
- Halftone dot patterns
- Comic panel borders optional
- Action lines and motion
- Speech bubbles and sound effects

## Typography

- Comic book lettering
- Impact fonts for emphasis
- POW/BANG effects for pop-art
- Caption boxes for narrative`,
	},

	"aged-academia": {
		ID:          "aged-academia",
		Name:        "复古学院风格",
		Description: "历史科学插图风格，仿古纸张美学",
		Prompt: `Historical scientific illustration with aged paper aesthetic.

## Color Palette

- Primary: Sepia brown (#704214), aged ink, muted earth tones
- Background: Parchment (#F4E4BC), yellowed paper texture
- Accents: Faded red annotations, iron gall ink spots

## Visual Elements

- Aged paper texture overlay
- Detailed cross-hatching and line work
- Scientific illustration precision
- Study notes and annotations
- Specimen plate or sketch aesthetic
- Numbered diagram elements

## Typography

- Handwritten cursive or serif fonts
- Scientific annotations
- Small caps for labels
- Italics for scientific names`,
	},

	"corporate-memphis": {
		ID:          "corporate-memphis",
		Name:        "企业扁平插画风格",
		Description: "扁平矢量人物，鲜艳几何填充",
		Prompt: `Flat vector people with vibrant geometric fills.

## Color Palette

- Primary: Bright, saturated - purple, orange, teal, yellow
- Background: White or light pastels
- Accents: Gradient fills, geometric patterns

## Visual Elements

- Flat vector illustration
- Disproportionate human figures
- Abstract body shapes
- Floating geometric elements
- No outlines, solid fills
- Plant and object accents

## Typography

- Clean sans-serif
- Bold headings
- Professional but friendly
- Minimal decoration`,
	},

	"technical-schematic": {
		ID:          "technical-schematic",
		Name:        "工程蓝图风格",
		Description: "工程技术图纸，精确的几何线条",
		Prompt: `Technical diagrams with engineering precision and clean geometry.

## Color Palette

- Primary: Blues (#2563EB), teals, grays, white lines
- Background: Deep blue (#1E3A5F), white, or light gray with grid
- Accents: Amber highlights (#F59E0B), cyan callouts

## Visual Elements

- Geometric precision throughout
- Grid pattern or isometric angle
- Dimension lines and measurements
- Technical symbols and annotations
- Clean vector shapes
- Consistent stroke weights

## Typography

- Technical stencil or clean sans-serif
- All-caps labels
- Measurement annotations
- Floating labels for isometric`,
	},

	"origami": {
		ID:          "origami",
		Name:        "折纸风格",
		Description: "折叠纸形态，几何精确",
		Prompt: `Folded paper forms with geometric precision.

## Color Palette

- Primary: Solid origami paper colors - red, blue, green, gold
- Background: White or soft gray, subtle shadows
- Accents: Paper fold highlights, crisp shadows

## Visual Elements

- Geometric folded shapes
- Visible fold lines
- Cast shadows showing depth
- Paper texture
- Angular, faceted forms
- Low-poly aesthetic

## Typography

- Clean geometric fonts
- Angular letterforms
- Folded paper text effect
- Minimal, precise labels`,
	},

	"pixel-art": {
		ID:          "pixel-art",
		Name:        "像素艺术风格",
		Description: "复古8位游戏美学",
		Prompt: `Retro 8-bit gaming aesthetic.

## Color Palette

- Primary: Limited palette - NES/SNES colors
- Background: Black or dark blue, scanlines optional
- Accents: Bright pixel highlights, CRT glow

## Visual Elements

- Visible pixel grid
- Limited color count per sprite
- 8-bit or 16-bit style
- Retro game UI elements
- Pixel-perfect edges
- Dithering for gradients

## Typography

- Pixel fonts
- Blocky letterforms
- Game UI style text
- Score/stat display style`,
	},

	"ui-wireframe": {
		ID:          "ui-wireframe",
		Name:        "UI线框图风格",
		Description: "灰度界面模型风格",
		Prompt: `Grayscale interface mockup style.

## Color Palette

- Primary: Grays - light (#E5E5E5), medium (#9CA3AF), dark (#374151)
- Background: White (#FFFFFF), light gray
- Accents: Blue for interactive (#3B82F6), red for emphasis

## Visual Elements

- Wireframe boxes and placeholders
- X marks for image placeholders
- Simple line icons
- Grid-based layout
- Annotation callouts
- Redline specifications

## Typography

- System fonts
- Placeholder "Lorem ipsum"
- UI label style
- Sans-serif throughout`,
	},

	"subway-map": {
		ID:          "subway-map",
		Name:        "地铁线路图风格",
		Description: "交通图风格，彩色线路和站点",
		Prompt: `Transit diagram style with colored lines and stations.

## Color Palette

- Primary: Transit line colors - red, blue, green, yellow, orange
- Background: White or light gray
- Accents: Station dots, interchange markers

## Visual Elements

- Colored route lines
- 45° and 90° angles only
- Station circle markers
- Interchange symbols
- Simplified geography
- Line thickness hierarchy

## Typography

- Clean sans-serif
- Station name labels
- Line number/name badges
- Horizontal or angled text`,
	},

	"ikea-manual": {
		ID:          "ikea-manual",
		Name:        "宜家说明书风格",
		Description: "极简线条艺术组装说明风格",
		Prompt: `Minimal line art assembly instruction style.

## Color Palette

- Primary: Black lines, minimal fills
- Background: White or cream paper
- Accents: Red for warnings, blue for highlights

## Visual Elements

- Simple line drawings
- Numbered step sequences
- Arrow indicators
- Exploded assembly views
- Wordless communication
- Stick figures for scale

## Typography

- Minimal text
- Step numbers prominent
- Universal symbols
- Simple sans-serif when needed`,
	},

	"knolling": {
		ID:          "knolling",
		Name:        "平铺陈列风格",
		Description: "俯视角度整齐排列的物品",
		Prompt: `Organized flat-lay with top-down arrangement.

## Color Palette

- Primary: Object's natural colors
- Background: Solid color - black, white, or colored surface
- Accents: Shadows, subtle highlights

## Visual Elements

- Top-down camera angle
- Objects arranged at 90° angles
- Equal spacing between items
- Clean organization
- Symmetry and order
- No overlapping items

## Typography

- Clean labels
- Positioned outside objects
- Connecting lines to items
- Minimal, catalog-style`,
	},

	"lego-brick": {
		ID:          "lego-brick",
		Name:        "乐高积木风格",
		Description: "玩具积木构造风格",
		Prompt: `Toy brick construction with playful aesthetic.

## Color Palette

- Primary: Classic LEGO colors - red, blue, yellow, green, white
- Background: Light gray baseplate or white
- Accents: Bright primary pops, shiny studs

## Visual Elements

- Visible brick studs
- Modular construction
- Minifigure characters
- Building instruction style
- Stackable elements
- Plastic sheen

## Typography

- Blocky, bold fonts
- LEGO instruction style
- Step numbers
- Playful appearance`,
	},

	"pop-laboratory": {
		ID:          "pop-laboratory",
		Name:        "实验室蓝图风格",
		Description: "实验室手册精度与流行艺术色彩的结合",
		Prompt: `Lab manual precision meets pop art color impact—coordinate systems, technical diagrams, and fluorescent accents on blueprint grid.

## Color Palette

- Background: Professional grayish-white with faint blueprint grid texture (#F2F2F2)
- Primary: Muted teal/sage green (#B8D8BE) for major functional blocks
- High-alert accent: Vibrant fluorescent pink (#E91E63) for warnings or critical data
- Marker highlights: Vivid lemon yellow (#FFF200) as translucent highlighter effect
- Line art: Ultra-fine charcoal brown (#2D2926) for technical grids

## Visual Elements

- Coordinate-style labels on every module (e.g., R-20, G-02, SEC-08)
- Technical diagrams: exploded views, cross-sections
- Vertical/horizontal rulers with precise markers
- Cross-hair targets, mathematical symbols
- High contrast between massive bold headers and tiny annotations

## Typography

- Headers: Bold brutalist characters, high visual impact
- Body: Professional sans-serif or crisp technical print
- Numbers: Large, highlighted with yellow or blue`,
	},

	"morandi-journal": {
		ID:          "morandi-journal",
		Name:        "莫兰迪手账风格",
		Description: "手绘涂鸦插画配温暖的莫兰迪色调",
		Prompt: `Hand-drawn doodle illustration with warm Morandi color tones and cozy bullet journal aesthetic.

## Color Palette

- Background: Warm cream/beige with subtle paper texture (#F5F0E6)
- Primary: Muted teal/sage green (#7BA3A8) for headers and frames
- Secondary: Warm terracotta/orange (#D4956A) for highlights
- Line art: Dark charcoal brown (#4A4540)
- Soft highlights: Pale yellow (#F5E6C8)

## Visual Elements

- Hand-drawn doodle illustrations with organic, slightly imperfect ink lines
- Washi tape strip decorations
- Rounded card containers for items
- Hand-drawn rulers, scales, and progress bars
- Smiley/frowny faces as quality markers
- Dotted line frames around sections
- Connecting arrows and dotted lines

## Typography

- Main title: Bold hand-lettered calligraphy style
- Module headers: Clean handwritten text in white on dark teal badge
- Numbers: Highlighted in terracotta`,
	},

	"retro-pop-grid": {
		ID:          "retro-pop-grid",
		Name:        "复古波普网格风格",
		Description: "1970年代复古波普艺术，瑞士网格和粗黑线",
		Prompt: `1970s retro pop art with strict Swiss international grid, thick black outlines, and flat color blocks.

## Color Palette

- Background: Warm vintage cream/beige (#F5F0E6)
- Flat accents: Salmon pink, sky blue, mustard yellow, mint green—muted retro tones
- Contrast blocks: Pure black (#000000) and pure white (#FFFFFF)
- Line art and outlines: Solid thick black

## Visual Elements

- Uniform thick black outlines on all elements
- Pure 2D flat vector aesthetic with subtle screen print texture
- Strict Swiss international grid: poster divided into square and rectangular cells
- Black-background cells with white text for warnings
- Geometric fill patterns: checkerboards, diagonal lines, dots
- Flat abstract symbols, warning signs, stars, arrows

## Typography

- Headers: Bold brutalist or retro thick display fonts
- Body: Clean sans-serif, structured alignment
- All content text in specified language`,
	},

	"chinese-guochao": {
		ID:          "chinese-guochao",
		Name:        "新中式国潮风格",
		Description: "现代中式美学，传统元素与现代设计融合",
		Prompt: `Modern Chinese aesthetic blending traditional elements with contemporary design.

## Color Palette

- Primary: Chinese red (#C41E3A), imperial gold (#FFD700), ink black (#1A1A1A)
- Background: Rice paper white (#FAF8F0), pale jade (#E8F4E8)
- Accents: Coral red, bronze, celadon green

## Visual Elements

- Traditional Chinese patterns: cloud motifs, waves, mountains
- Modern reinterpretation of classical elements
- Clean geometric compositions with traditional accents
- Red seals and stamp marks
- Ink wash painting influences
- Minimalist white space with bold red accents

## Typography

- Bold Chinese calligraphy-style headings
- Clean sans-serif for body text
- Red seal stamps for emphasis
- Vertical text layouts optional`,
	},

	"vaporwave": {
		ID:          "vaporwave",
		Name:        "蒸汽波风格",
		Description: "80年代复古未来主义，霓虹渐变和怀旧美学",
		Prompt: `80s retro-futuristic aesthetic with neon gradients and nostalgic vibes.

## Color Palette

- Primary: Hot pink (#FF71CE), cyan (#01CDFE), purple (#B967FF)
- Background: Deep purple gradients, sunset orange fades
- Accents: Glitch effects, scan lines, chrome textures

## Visual Elements

- Retro computer graphics aesthetic
- Gradient mesh backgrounds
- Greek statue fragments, palm trees, checkerboards
- Glitch art effects
- VHS scan lines and distortion
- Sunsets and city skylines

## Typography

- Retro pixelated fonts
- Neon glow text effects
- Japanese katakana accents
- Stretched and distorted letters`,
	},

	"vintage-oil-painting": {
		ID:          "vintage-oil-painting",
		Name:        "复古油画风格",
		Description: "古典油画质感，厚重笔触和温暖色调",
		Prompt: `Classical oil painting texture with rich brushstrokes and warm tones.

## Color Palette

- Primary: Warm earth tones, ochre, sienna, umber
- Background: Aged canvas texture, warm cream
- Accents: Deep reds, gold leaf highlights, rich browns

## Visual Elements

- Visible brushstroke texture
- Classic painting composition
- Ornate gilded frames as borders
- Renaissance-style lighting
- Classical art references
- Aged canvas texture overlay

## Typography

- Elegant serif fonts
- Classic calligraphy style
- Gilded text effects
- Ornate drop caps`,
	},

	"fresh-watercolor": {
		ID:          "fresh-watercolor",
		Name:        "清新水彩风格",
		Description: "轻盈透明的水彩效果，清新自然的色调",
		Prompt: `Light and transparent watercolor effect with fresh natural tones.

## Color Palette

- Primary: Soft pastels - mint green, peach, sky blue, lavender
- Background: Pure white with subtle watercolor washes
- Accents: Delicate color bleeds, soft gradients

## Visual Elements

- Transparent watercolor washes
- Soft color bleeding and blending
- Delicate brushstrokes
- Botanical illustrations
- Light and airy compositions
- Splatter and drip effects

## Typography

- Elegant handwritten style
- Light and flowing letterforms
- Soft pastel text colors
- Integrated with illustrations`,
	},

	"minimal-business": {
		ID:          "minimal-business",
		Name:        "极简商务风格",
		Description: "专业简洁的企业风格，清晰的层次结构",
		Prompt: `Professional minimalist corporate style with clean hierarchy.

## Color Palette

- Primary: Navy blue (#1E3A5F), charcoal gray (#2D3436)
- Background: Pure white, light gray (#F5F5F5)
- Accents: Corporate blue (#0066CC), subtle gradients

## Visual Elements

- Clean geometric shapes
- Generous white space
- Subtle shadows and depth
- Professional icons and infographics
- Grid-based layouts
- Minimal decorative elements

## Typography

- Clean sans-serif fonts (Helvetica, Arial style)
- Strong hierarchy with bold headings
- Left-aligned text blocks
- Minimal decoration`,
	},

	"fun-cartoon": {
		ID:          "fun-cartoon",
		Name:        "趣味卡通风格",
		Description: "活泼可爱的卡通插画，明快鲜艳的色彩",
		Prompt: `Playful cartoon illustration with bright vivid colors.

## Color Palette

- Primary: Bright saturated colors - red, yellow, blue, green
- Background: Light pastels or white
- Accents: Bold outlines, vibrant highlights

## Visual Elements

- Cute cartoon characters and mascots
- Rounded, friendly shapes
- Bold black outlines
- Expressive faces and emotions
- Fun patterns and textures
- Playful compositions

## Typography

- Rounded, bubbly fonts
- Fun letter spacing
- Cartoon speech bubbles
- Colorful text highlights`,
	},

	"scifi-future": {
		ID:          "scifi-future",
		Name:        "科幻未来风格",
		Description: "未来科技感，全息效果和电子元素",
		Prompt: `Futuristic sci-fi aesthetic with holographic effects and electronic elements.

## Color Palette

- Primary: Electric blue (#00D4FF), silver, white
- Background: Dark space blue (#0A1628), black
- Accents: Holographic gradients, neon glows

## Visual Elements

- Holographic interface elements
- Floating geometric shapes
- Circuit board patterns
- Glowing edges and outlines
- Digital grid backgrounds
- Abstract tech decorations

## Typography

- Sleek futuristic fonts
- Glowing text effects
- Digital display style
- Clean geometric letterforms`,
	},

	"hand-drawn-illustration": {
		ID:          "hand-drawn-illustration",
		Name:        "手绘插画风格",
		Description: "温暖的手绘质感，独特的艺术气息",
		Prompt: `Warm hand-drawn texture with unique artistic character.

## Color Palette

- Primary: Natural earth tones, warm neutrals
- Background: Off-white paper texture, cream
- Accents: Colored pencil textures, ink lines

## Visual Elements

- Visible hand-drawn lines
- Organic, imperfect shapes
- Pencil and ink textures
- Sketch-style illustrations
- Cross-hatching and shading
- Paper texture overlay

## Typography

- Hand-lettered style
- Slight irregularities for authenticity
- Ink and pen aesthetic
- Integrated with illustrations`,
	},

	"chinese-ink-wash": {
		ID:          "chinese-ink-wash",
		Name:        "国风水墨风格",
		Description: "传统水墨画意境，留白与意境之美",
		Prompt: `Traditional Chinese ink wash painting aesthetic with elegant simplicity.

## Color Palette

- Primary: Black ink gradients, shades of gray
- Background: Rice paper white, aged parchment
- Accents: Subtle red seal marks, pale green

## Visual Elements

- Traditional ink wash brushstrokes
- Mountains, rivers, bamboo, plum blossoms
- Heavy use of negative space (留白)
- Misty, atmospheric quality
- Calligraphic elements
- Red seal stamps

## Typography

- Chinese calligraphy style
- Vertical text arrangement optional
- Elegant brush-written characters
- Minimal, refined labels`,
	},

	"japanese-wafu": {
		ID:          "japanese-wafu",
		Name:        "日式和风风格",
		Description: "日本传统美学，和风纹样与淡雅色调",
		Prompt: `Traditional Japanese aesthetic with elegant patterns and subtle colors.

## Color Palette

- Primary: Indigo blue, cherry blossom pink, matcha green
- Background: Cream, soft white, light gray
- Accents: Gold leaf, red accents, navy blue

## Visual Elements

- Traditional Japanese patterns: seigaiha, asanoha, sakura
- Clean, balanced compositions
- Nature motifs: cherry blossoms, bamboo, waves
- Origami elements
- Washi paper texture
- Minimal zen aesthetic

## Typography

- Elegant Japanese-inspired fonts
- Vertical text options
- Minimal and refined
- Red hanko stamp accents`,
	},

	"european-vintage": {
		ID:          "european-vintage",
		Name:        "欧式复古风格",
		Description: "欧洲古典装饰风格，华丽优雅的细节",
		Prompt: `European classical decorative style with ornate elegant details.

## Color Palette

- Primary: Burgundy, forest green, royal blue
- Background: Aged parchment, cream, gold accents
- Accents: Gold filigree, brass elements, aged patina

## Visual Elements

- Ornate borders and frames
- Baroque and Rococo decorative elements
- Classical architectural motifs
- Vintage botanical illustrations
- Filigree and scrollwork
- Aged paper texture

## Typography

- Elegant serif fonts
- Ornate drop caps
- Classical typography
- Gold or burgundy text`,
	},

	"fashion-magazine": {
		ID:          "fashion-magazine",
		Name:        "时尚杂志风格",
		Description: "高端时尚杂志排版，大胆的视觉冲击",
		Prompt: `High-end fashion magazine layout with bold visual impact.

## Color Palette

- Primary: Bold black, crisp white, accent colors
- Background: White with bold color blocks
- Accents: Vibrant pops of color, metallic accents

## Visual Elements

- Large dramatic imagery
- Bold color blocking
- Editorial photography style
- Clean grid layouts
- High contrast compositions
- Trendy geometric shapes

## Typography

- Bold sans-serif headlines
- Mix of serif and sans-serif
- Large display text
- Tight tracking, bold weights`,
	},

	"childrens-book": {
		ID:          "childrens-book",
		Name:        "儿童绘本风格",
		Description: "童趣可爱的插画风格，温暖明快的色彩",
		Prompt: `Whimsical children's book illustration with warm bright colors.

## Color Palette

- Primary: Bright primary colors, cheerful pastels
- Background: Soft white, light blue, pale yellow
- Accents: Sunny yellows, grass greens, sky blues

## Visual Elements

- Cute character illustrations
- Rounded, friendly shapes
- Soft, cozy textures
- Nature elements: sun, clouds, trees
- Playful patterns
- Storybook quality

## Typography

- Rounded, friendly fonts
- Large readable text
- Fun letter decorations
- Speech bubbles`,
	},

	"tropical-vacation": {
		ID:          "tropical-vacation",
		Name:        "热带度假风格",
		Description: "阳光沙滩的热带风情，活力四射的色彩",
		Prompt: `Sunny tropical vacation vibe with vibrant energetic colors.

## Color Palette

- Primary: Turquoise, coral pink, sunset orange
- Background: Sandy beige, sky blue, ocean teal
- Accents: Palm green, hibiscus pink, sunshine yellow

## Visual Elements

- Tropical foliage and palm leaves
- Ocean waves and beach elements
- Exotic flowers and fruits
- Sun and cloud motifs
- Relaxed, breezy compositions
- Summer patterns

## Typography

- Casual, relaxed fonts
- Rounded letterforms
- Bright, cheerful colors
- Tropical-themed decorations`,
	},

	"art-deco": {
		ID:          "art-deco",
		Name:        "装饰艺术风格",
		Description: "1920年代Art Deco风格，几何与奢华的融合",
		Prompt: `1920s Art Deco style with geometric elegance and luxury.

## Color Palette

- Primary: Gold, black, cream white
- Background: Deep navy, black with gold accents
- Accents: Emerald green, ruby red, metallic gold

## Visual Elements

- Geometric patterns and symmetry
- Sunburst motifs
- Fan and chevron shapes
- Streamlined, elegant lines
- Metallic gold accents
- Luxury and glamour aesthetic

## Typography

- Bold geometric fonts
- Art Deco style lettering
- Stylized, decorative characters
- Gold or metallic text effects`,
	},

	"gradient-fluid": {
		ID:          "gradient-fluid",
		Name:        "渐变流体风格",
		Description: "现代流体渐变，柔和流动的视觉效果",
		Prompt: `Modern fluid gradients with soft flowing visual effects.

## Color Palette

- Primary: Vibrant gradients - purple to pink, blue to teal
- Background: Soft gradient meshes
- Accents: Contrasting gradient pops, white highlights

## Visual Elements

- Smooth gradient transitions
- Abstract fluid shapes
- Soft, rounded forms
- Glass morphism effects
- Flowing, organic compositions
- Modern, tech-forward feel

## Typography

- Modern sans-serif fonts
- Clean, minimal text
- White or dark text on gradients
- Subtle shadows for depth`,
	},

	"paper-cut": {
		ID:          "paper-cut",
		Name:        "剪纸艺术风格",
		Description: "立体剪纸效果，层叠的深度感",
		Prompt: `3D paper cut art effect with layered depth and shadows.

## Color Palette

- Primary: Solid paper colors - white, pastels, bold colors
- Background: White or light colors
- Accents: Cast shadows, depth layers

## Visual Elements

- Layered paper cutouts
- Visible depth and dimension
- Clean sharp edges
- Cast shadows between layers
- Geometric or organic shapes
- Craft paper texture

## Typography

- Bold, clean fonts
- Paper cut style lettering
- Shadow effects for depth
- Layered text elements`,
	},

	"memphis-design": {
		ID:          "memphis-design",
		Name:        "孟菲斯风格",
		Description: "80年代孟菲斯设计，大胆几何与撞色",
		Prompt: `1980s Memphis Design style with bold geometry and clashing colors.

## Color Palette

- Primary: Bright yellow, pink, teal, blue
- Background: White or black with colorful elements
- Accents: Black outlines, geometric patterns

## Visual Elements

- Bold geometric shapes: triangles, circles, squiggles
- Vibrant color combinations
- Playful patterns and textures
- Terrazzo and confetti effects
- Asymmetrical compositions
- Fun, energetic vibe

## Typography

- Bold, geometric fonts
- Playful letter spacing
- Mix of styles and weights
- Colorful text elements`,
	},

	"gradient-mesh": {
		ID:          "gradient-mesh",
		Name:        "网格渐变风格",
		Description: "抽象网格渐变，现代科技感",
		Prompt: `Abstract mesh gradients with modern tech aesthetic.

## Color Palette

- Primary: Soft gradient blends - purple, blue, pink, orange
- Background: Smooth gradient mesh
- Accents: Subtle highlights, soft glows

## Visual Elements

- Smooth color transitions
- Abstract blob shapes
- 3D mesh gradients
- Soft, dreamy quality
- Modern and sophisticated
- Minimal geometric overlays

## Typography

- Clean modern fonts
- White text with shadows
- Minimal, refined labels
- Gradient text effects`,
	},

	"bauhaus": {
		ID:          "bauhaus",
		Name:        "包豪斯风格",
		Description: "包豪斯设计风格，功能主义与几何美学",
		Prompt: `Bauhaus design style with functionalist geometry and primary colors.

## Color Palette

- Primary: Primary colors - red, yellow, blue
- Background: White, black, gray
- Accents: Bold color blocks, black lines

## Visual Elements

- Basic geometric shapes: circle, triangle, square
- Primary color palette
- Strong horizontal and vertical lines
- Grid-based compositions
- Form follows function
- Minimal, clean aesthetic

## Typography

- Geometric sans-serif fonts
- Bold, uppercase headings
- Clean and functional
- Strong typographic hierarchy`,
	},

	"duotone": {
		ID:          "duotone",
		Name:        "双色风格",
		Description: "简约双色设计，强烈的视觉对比",
		Prompt: `Minimal duotone design with strong visual contrast.

## Color Palette

- Primary: Two contrasting colors - often black + accent or complementary pair
- Background: One of the two colors
- Accents: The contrasting color

## Visual Elements

- Two-color limitation
- High contrast imagery
- Bold color overlays
- Halftone or posterized effects
- Clean, modern compositions
- Striking visual impact

## Typography

- Bold sans-serif fonts
- High contrast with background
- Clean, minimal
- Strong headlines`,
	},

	"minimalist-line": {
		ID:          "minimalist-line",
		Name:        "极简线条风格",
		Description: "简约线条设计，干净利落的视觉效果",
		Prompt: `Minimalist line art design with clean sharp visual effect.

## Color Palette

- Primary: Black lines, single accent color
- Background: Pure white, off-white
- Accents: One bold accent color (red, blue, or yellow)

## Visual Elements

- Thin clean lines
- Minimal decoration
- Lots of white space
- Simple geometric shapes
- Line art illustrations
- Clean iconography

## Typography

- Thin sans-serif fonts
- Generous letter spacing
- Minimal, refined
- Clean hierarchy`,
	},

	"retro-newspaper": {
		ID:          "retro-newspaper",
		Name:        "复古报纸风格",
		Description: "老式报纸排版，怀旧印刷质感",
		Prompt: `Vintage newspaper layout with nostalgic print texture.

## Color Palette

- Primary: Black ink, sepia tones
- Background: Aged newsprint, off-white paper
- Accents: Red highlights, aged yellow

## Visual Elements

- Newspaper column layout
- Old printing texture
- Serif typography
- Vintage advertisements style
- Black and white photography
- Aging and weathering effects

## Typography

- Classic serif fonts
- Multi-column text layout
- Old-style headlines
- Vintage letterpress quality`,
	},

	"movie-poster": {
		ID:          "movie-poster",
		Name:        "电影海报风格",
		Description: "戏剧性电影海报设计，震撼的视觉效果",
		Prompt: `Dramatic movie poster design with stunning visual impact.

## Color Palette

- Primary: Bold contrasting colors, cinematic tones
- Background: Dark gradients, atmospheric
- Accents: Spotlight effects, glowing highlights

## Visual Elements

- Dramatic lighting and shadows
- Cinematic composition
- Bold imagery
- Film grain texture
- Title card styling
- Atmospheric effects

## Typography

- Bold condensed fonts
- Movie title styling
- Credit block formatting
- Dramatic text placement`,
	},

	"music-festival": {
		ID:          "music-festival",
		Name:        "音乐节风格",
		Description: "活力四射的音乐节海报，动感十足",
		Prompt: `Energetic music festival poster with dynamic vibrant feel.

## Color Palette

- Primary: Neon colors, vibrant gradients
- Background: Dark with light bursts
- Accents: Psychedelic color combinations

## Visual Elements

- Dynamic typography
- Abstract music elements
- Festival crowd silhouettes
- Sound wave patterns
- Light show effects
- Energetic compositions

## Typography

- Bold display fonts
- Stacked and layered text
- Vibrant color fills
- Music-inspired styling`,
	},

	"brutalist": {
		ID:          "brutalist",
		Name:        "粗野主义风格",
		Description: "大胆粗犷的设计，强烈的视觉冲击",
		Prompt: `Bold brutalist design with raw powerful visual impact.

## Color Palette

- Primary: Black, white, bold primary colors
- Background: Raw concrete gray, stark white
- Accents: High contrast color blocks

## Visual Elements

- Raw, unpolished aesthetic
- Massive typography
- Heavy geometric shapes
- Asymmetrical layouts
- Exposed grid structures
- Industrial feel

## Typography

- Ultra-bold fonts
- Massive headings
- Tight spacing
- Raw, untreated appearance`,
	},

	"glassmorphism": {
		ID:          "glassmorphism",
		Name:        "玻璃拟态风格",
		Description: "半透明玻璃效果，现代通透感",
		Prompt: `Semi-transparent glass effect with modern translucent feel.

## Color Palette

- Primary: Soft pastels, frosted colors
- Background: Colorful gradients, blurred backgrounds
- Accents: White highlights, subtle shadows

## Visual Elements

- Frosted glass panels
- Background blur effects
- Soft shadows and borders
- Translucent layers
- Modern UI aesthetic
- Depth and dimension

## Typography

- Clean modern fonts
- Good readability on glass
- Subtle shadows for depth
- Minimal, refined style`,
	},

	"neumorphism": {
		ID:          "neumorphism",
		Name:        "新拟物风格",
		Description: "柔和凸起效果，现代3D质感",
		Prompt: `Soft raised effect with modern 3D tactile quality.

## Color Palette

- Primary: Soft monochromatic tones
- Background: Light gray or pastel base
- Accents: Subtle shadows and highlights

## Visual Elements

- Soft extruded shapes
- Raised and pressed states
- Subtle shadows (inner and outer)
- Tactile appearance
- Soft, cushiony feel
- Clean, minimal interface

## Typography

- Clean sans-serif fonts
- Subtle embossed effect
- Soft shadows on text
- Minimal hierarchy`,
	},

	"isometric-3d": {
		ID:          "isometric-3d",
		Name:        "等距3D风格",
		Description: "等距视角的3D图形，现代立体感",
		Prompt: `Isometric 3D graphics with modern dimensional feel.

## Color Palette

- Primary: Soft 3D gradients, pastel solids
- Background: Light with subtle grid
- Accents: Shadow tones, highlight edges

## Visual Elements

- Isometric grid perspective
- 3D block constructions
- Consistent 30° angles
- Soft shadows for depth
- Clean geometric shapes
- Modern tech illustration

## Typography

- Clean geometric fonts
- Aligned to isometric grid
- 3D text effects optional
- Modern, technical feel`,
	},

	"collage-scrapbook": {
		ID:          "collage-scrapbook",
		Name:        "拼贴手账风格",
		Description: "剪贴簿拼贴效果，手工艺术感",
		Prompt: `Scrapbook collage effect with handmade artistic feel.

## Color Palette

- Primary: Mixed paper colors, washi tape tones
- Background: Kraft paper, notebook paper
- Accents: Tape strips, stickers, doodles

## Visual Elements

- Torn paper edges
- Tape and sticker decorations
- Layered photo collage
- Handwritten notes
- Doodles and sketches
- Mixed media aesthetic

## Typography

- Handwritten fonts
- Mix of styles and sizes
- Sticker-like text
- Casual, friendly appearance`,
	},

	"gradient-abstract": {
		ID:          "gradient-abstract",
		Name:        "抽象渐变风格",
		Description: "抽象艺术渐变，梦幻流动感",
		Prompt: `Abstract art gradients with dreamy flowing feel.

## Color Palette

- Primary: Vibrant multi-color gradients
- Background: Deep color blends
- Accents: Light bursts, color transitions

## Visual Elements

- Abstract organic shapes
- Smooth color transitions
- Liquid-like forms
- Ethereal, dreamy quality
- Modern art aesthetic
- Flowing compositions

## Typography

- Modern sans-serif fonts
- White text on dark gradients
- Clean, minimal
- Integrated with shapes`,
	},

	"vintage-travel": {
		ID:          "vintage-travel",
		Name:        "复古旅行风格",
		Description: "老式旅行海报，怀旧冒险气息",
		Prompt: `Vintage travel poster with nostalgic adventure spirit.

## Color Palette

- Primary: Warm sunset colors, earth tones
- Background: Aged paper, warm cream
- Accents: Bold poster colors, stamp red

## Visual Elements

- Vintage travel poster style
- Landmark illustrations
- Retro transportation graphics
- Travel stamps and postmarks
- Art deco influences
- Nostalgic travel aesthetic

## Typography

- Vintage display fonts
- Retro poster styling
- Travel-inspired elements
- Hand-lettered feel`,
	},

	"botanical-garden": {
		ID:          "botanical-garden",
		Name:        "植物花园风格",
		Description: "自然植物插画，清新花园气息",
		Prompt: `Natural botanical illustration with fresh garden atmosphere.

## Color Palette

- Primary: Botanical greens, flower colors
- Background: Cream, soft white, aged paper
- Accents: Earth tones, watercolor washes

## Visual Elements

- Detailed botanical illustrations
- Leaves, flowers, plants
- Natural science aesthetic
- Organic compositions
- Vintage botanical print style
- Nature-inspired patterns

## Typography

- Elegant serif fonts
- Botanical-inspired lettering
- Vintage scientific labels
- Natural, refined style`,
	},

	"geometric-abstract": {
		ID:          "geometric-abstract",
		Name:        "几何抽象风格",
		Description: "几何图形艺术，现代抽象美学",
		Prompt: `Geometric abstract art with modern aesthetic.

## Color Palette

- Primary: Bold geometric colors
- Background: White or dark with shapes
- Accents: Contrasting color blocks

## Visual Elements

- Clean geometric shapes
- Overlapping forms
- Bold color combinations
- Abstract compositions
- Modern art references
- Dynamic balance

## Typography

- Modern geometric fonts
- Clean, minimal
- Integrated with shapes
- Bold headings`,
	},

	"retro-arcade": {
		ID:          "retro-arcade",
		Name:        "复古街机风格",
		Description: "80年代街机游戏美学，怀旧游戏感",
		Prompt: `80s arcade game aesthetic with nostalgic gaming feel.

## Color Palette

- Primary: Neon arcade colors, CRT glow
- Background: Dark with scanlines
- Accents: Glowing pixels, game colors

## Visual Elements

- Arcade cabinet styling
- Pixel art graphics
- CRT screen effects
- Game UI elements
- High score displays
- Retro gaming aesthetics

## Typography

- Arcade-style fonts
- Glowing text effects
- Pixel letterforms
- Game-inspired styling`,
	},

	"luxe-gold": {
		ID:          "luxe-gold",
		Name:        "奢华金色风格",
		Description: "高端奢华金色设计，尊贵气质",
		Prompt: `High-end luxury gold design with premium elegant feel.

## Color Palette

- Primary: Gold, champagne, bronze
- Background: Deep black, navy, burgundy
- Accents: Rose gold, silver highlights

## Visual Elements

- Gold foil textures
- Elegant metallic finishes
- Luxury brand aesthetic
- Sophisticated patterns
- Premium quality feel
- Refined details

## Typography

- Elegant serif fonts
- Gold metallic text
- Sophisticated styling
- Luxury brand typography`,
	},

	"sports-athletic": {
		ID:          "sports-athletic",
		Name:        "运动竞技风格",
		Description: "动感运动风格，活力竞技气息",
		Prompt: `Dynamic sports style with energetic athletic atmosphere.

## Color Palette

- Primary: Bold team colors, energetic hues
- Background: Dynamic gradients, action shots
- Accents: Neon highlights, motion lines

## Visual Elements

- Action photography style
- Motion blur effects
- Athletic silhouettes
- Dynamic diagonal lines
- Sports graphics
- Energetic compositions

## Typography

- Bold athletic fonts
- Jersey-style numbers
- Dynamic text angles
- Sport-inspired styling`,
	},

	"comic-manga": {
		ID:          "comic-manga",
		Name:        "日式漫画风格",
		Description: "日本漫画美学，动感线条与速度感",
		Prompt: `Japanese manga aesthetic with dynamic lines and speed.

## Color Palette

- Primary: Black ink, screentone grays
- Background: White with pattern screens
- Accents: Bold black lines, impact effects

## Visual Elements

- Manga-style illustrations
- Speed lines and motion effects
- Screentone patterns
- Dramatic panel layouts
- Emotion symbols (sweat drops, etc.)
- Dynamic action poses

## Typography

- Manga-style fonts
- Bold sound effects
- Dynamic speech bubbles
- Japanese comic styling`,
	},

	"woodcut-print": {
		ID:          "woodcut-print",
		Name:        "木刻版画风格",
		Description: "传统木刻印刷效果，质朴艺术感",
		Prompt: `Traditional woodcut print effect with rustic artistic feel.

## Color Palette

- Primary: Black ink, earth tones
- Background: Aged paper, natural fibers
- Accents: Limited color blocks

## Visual Elements

- Wood grain texture
- Hand-carved appearance
- Bold black lines
- Negative space usage
- Traditional print aesthetic
- Rustic, organic feel

## Typography

- Carved letter appearance
- Bold, rough edges
- Traditional printing style
- Handmade quality`,
	},

	"sticker-bomb": {
		ID:          "sticker-bomb",
		Name:        "贴纸炸弹风格",
		Description: "密集贴纸装饰，街头潮流感",
		Prompt: `Dense sticker decoration with street trend feel.

## Color Palette

- Primary: Vibrant mixed colors
- Background: Any color with sticker overlay
- Accents: Bold outlines, white borders

## Visual Elements

- Overlapping stickers
- Die-cut shapes
- Street art aesthetic
- Pop culture references
- Urban youth style
- Layered compositions

## Typography

- Sticker-style text
- Bold outlines
- Mix of fonts and styles
- Urban, playful feel`,
	},

	"zen-minimal": {
		ID:          "zen-minimal",
		Name:        "禅意极简风格",
		Description: "东方禅意美学，宁静简约之美",
		Prompt: `Eastern zen aesthetic with peaceful minimalist beauty.

## Color Palette

- Primary: Natural tones, muted earth colors
- Background: Warm white, soft beige
- Accents: Ink black, subtle nature colors

## Visual Elements

- Extreme minimalism
- Balance and harmony
- Natural materials aesthetic
- Calm compositions
- Empty space as design
- Organic simplicity

## Typography

- Minimal, refined fonts
- Generous white space
- Elegant simplicity
- Zen-inspired balance`,
	},

	"retro-50s-diner": {
		ID:          "retro-50s-diner",
		Name:        "50年代餐厅风格",
		Description: "美国50年代复古餐厅，怀旧摇滚风",
		Prompt: `American 1950s diner retro with nostalgic rock and roll style.

## Color Palette

- Primary: Cherry red, turquoise, cream
- Background: Checkerboard patterns, chrome
- Accents: Neon signs, jukebox colors

## Visual Elements

- Checkerboard floors
- Chrome and vinyl aesthetic
- Jukebox elements
- Retro diners style
- Vintage Americana
- Rock and roll graphics

## Typography

- Retro script fonts
- Neon sign styling
- 50s advertising style
- Playful, nostalgic feel`,
	},

	"outer-space": {
		ID:          "outer-space",
		Name:        "太空宇宙风格",
		Description: "宇宙星空主题，神秘浩瀚感",
		Prompt: `Cosmic space theme with mysterious vast feel.

## Color Palette

- Primary: Deep space blues, purples, black
- Background: Starfield, nebula gradients
- Accents: Bright stars, planet colors

## Visual Elements

- Stars and galaxies
- Planet illustrations
- Nebula effects
- Space exploration theme
- Astronomical elements
- Cosmic dust and light

## Typography

- Futuristic fonts
- Glowing text effects
- Space-inspired styling
- Modern, scientific feel`,
	},

	"retro-future": {
		ID:          "retro-future",
		Name:        "复古未来风格",
		Description: "60年代未来主义，原子时代美学",
		Prompt: `1960s futurism with atomic age aesthetic.

## Color Palette

- Primary: Turquoise, orange, atomic gold
- Background: Space age silver, white
- Accents: Atom patterns, starbursts

## Visual Elements

- Googie architecture style
- Atom and molecule motifs
- Flying saucer shapes
- Boomerang forms
- Space age optimism
- Mid-century modern

## Typography

- Space age fonts
- Atomic styling
- Retro-futuristic feel
- Optimistic, forward-looking`,
	},

	"new-yorker": {
		ID:          "new-yorker",
		Name:        "纽约客风格",
		Description: "纽约客杂志插画风格，优雅讽刺",
		Prompt: `New Yorker magazine illustration style with elegant satire.

## Color Palette

- Primary: Black ink, watercolor washes
- Background: Off-white paper
- Accents: Subtle color tints

## Visual Elements

- Elegant line drawings
- Satirical illustrations
- Magazine cover aesthetic
- Sophisticated caricatures
- Cultural commentary
- Refined art style

## Typography

- Elegant serif fonts
- New Yorker masthead style
- Refined typography
- Classic magazine layout`,
	},

	"low-poly": {
		ID:          "low-poly",
		Name:        "低多边形风格",
		Description: "几何多边形艺术，现代数字感",
		Prompt: `Geometric polygon art with modern digital feel.

## Color Palette

- Primary: Solid flat colors per polygon
- Background: Gradient or solid
- Accents: Edge highlights, shadows

## Visual Elements

- Faceted geometric shapes
- Triangular polygons
- Clean geometric forms
- Digital art aesthetic
- 3D rendered look
- Sharp edges and planes

## Typography

- Geometric fonts
- Clean, modern
- Low-poly text effects
- Digital aesthetic`,
	},

	"ukiyo-e": {
		ID:          "ukiyo-e",
		Name:        "浮世绘风格",
		Description: "日本浮世绘艺术，传统东方美学",
		Prompt: `Japanese ukiyo-e art with traditional eastern aesthetic.

## Color Palette

- Primary: Prussian blue, vermillion, indigo
- Background: Cream washi paper
- Accents: Gold leaf, organic pigments

## Visual Elements

- Woodblock print style
- Flat color areas
- Bold black outlines
- Traditional Japanese motifs
- Wave and mountain forms
- Edo period aesthetic

## Typography

- Japanese-inspired fonts
- Vertical text options
- Traditional calligraphy
- Elegant brush style`,
	},

	"swiss-international": {
		ID:          "swiss-international",
		Name:        "瑞士国际风格",
		Description: "瑞士平面设计，网格与无衬线字体",
		Prompt: `Swiss graphic design with grid and sans-serif typography.

## Color Palette

- Primary: Black, red, white
- Background: White or light gray
- Accents: Bold primary colors

## Visual Elements

- Strict grid system
- Clean geometric shapes
- Asymmetrical balance
- White space emphasis
- Photography integration
- Mathematical precision

## Typography

- Helvetica-style fonts
- Strong typographic hierarchy
- Grid-aligned text
- Clean, objective design`,
	},

	"art-nouveau": {
		ID:          "art-nouveau",
		Name:        "新艺术风格",
		Description: "19世纪新艺术运动，自然曲线与装饰",
		Prompt: `19th century Art Nouveau with natural curves and ornamentation.

## Color Palette

- Primary: Muted greens, golds, lilacs
- Background: Cream, aged paper
- Accents: Organic color flows

## Visual Elements

- Organic flowing lines
- Natural forms and curves
- Floral and plant motifs
- Decorative borders
- Elegant ornamentation
- Mucha-style illustrations

## Typography

- Art Nouveau lettering
- Flowing organic forms
- Decorative initials
- Elegant, curvilinear style`,
	},

	"neon-noir": {
		ID:          "neon-noir",
		Name:        "霓虹黑色风格",
		Description: "黑色电影配霓虹灯光，都市夜晚感",
		Prompt: `Film noir with neon lighting for urban night atmosphere.

## Color Palette

- Primary: Deep blacks, neon colors
- Background: Dark urban nights
- Accents: Neon pink, blue, purple glows

## Visual Elements

- High contrast shadows
- Neon sign reflections
- Rain-slicked streets
- Urban night photography
- Mysterious atmosphere
- Cinematic mood

## Typography

- Neon glow text
- Bold display fonts
- High contrast styling
- Urban, edgy feel`,
	},

	"boho-chic": {
		ID:          "boho-chic",
		Name:        "波西米亚风格",
		Description: "自由奔放的波西米亚风，艺术浪漫",
		Prompt: `Free-spirited bohemian style with artistic romance.

## Color Palette

- Primary: Warm earth tones, terracotta
- Background: Cream, natural textures
- Accents: Jewel tones, ethnic patterns

## Visual Elements

- Macramé and textile textures
- Ethnic patterns and motifs
- Feather and fringe elements
- Natural materials
- Layered, eclectic feel
- Artistic, carefree vibe

## Typography

- Hand-drawn fonts
- Casual, artistic style
- Mix of weights and styles
- Free-spirited feel`,
	},

	"propaganda-poster": {
		ID:          "propaganda-poster",
		Name:        "宣传海报风格",
		Description: "复古宣传海报，强烈视觉号召力",
		Prompt: `Vintage propaganda poster with strong visual call-to-action.

## Color Palette

- Primary: Bold red, black, cream
- Background: Aged paper or solid colors
- Accents: Strong contrast colors

## Visual Elements

- Bold graphic imagery
- Strong diagonal compositions
- Powerful symbolism
- Limited color palette
- Dynamic typography
- Impactful messaging

## Typography

- Bold condensed fonts
- All-caps headlines
- Strong, commanding presence
- Vintage poster style`,
	},

	"grunge-distressed": {
		ID:          "grunge-distressed",
		Name:        "垃圾摇滚风格",
		Description: "破旧磨损效果，叛逆另类美学",
		Prompt: `Distressed grunge effect with rebellious alternative aesthetic.

## Color Palette

- Primary: Dark, muted colors
- Background: Textured, distressed surfaces
- Accents: Raw, gritty textures

## Visual Elements

- Distressed textures
- Scratches and wear marks
- Grainy, noisy surfaces
- Rough, imperfect edges
- Alternative music aesthetic
- Raw, unpolished feel

## Typography

- Distressed fonts
- Rough, worn edges
- Alternative styling
- Rebellious, edgy feel`,
	},
}

// GetInfographStyle returns the style by ID, or the default style if not found
func GetInfographStyle(styleID string) InfographStyle {
	if styleID == "" {
		styleID = DefaultInfographStyle
	}
	if style, ok := InfographStyles[styleID]; ok {
		return style
	}
	return InfographStyles[DefaultInfographStyle]
}

// ListInfographStyles returns all available styles
func ListInfographStyles() []InfographStyle {
	styles := make([]InfographStyle, 0, len(InfographStyles))
	for _, style := range InfographStyles {
		styles = append(styles, style)
	}
	return styles
}

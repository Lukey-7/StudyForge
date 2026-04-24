# Audio File Support

StudyForge now supports uploading audio files and automatically transcribing them to text using vosk-transcriber.

## Supported Audio Formats

The following audio and video formats are supported for transcription:

- **Audio formats**: MP3, WAV, M4A, AAC, FLAC, OGG, WMA, OPUS
- **Video formats** (audio extraction): MP4, AVI, MKV, MOV, WebM

## Installation

### Step 1: Install vosk-transcriber

Follow the instructions at https://github.com/alphacep/vosk-transcriber to install vosk-transcriber.

Quick install:
```bash
# Clone the repository
git clone https://github.com/alphacep/vosk-transcriber.git
cd vosk-transcriber

# Install Python dependencies
pip install -r requirements.txt

# Or install using pip
pip install vosk-transcriber
```

### Step 2: Download a Vosk Model

Download a model from https://alphacephei.com/vosk/models

**English models:**
- Small (fast, good accuracy): https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
- Full (slower, better accuracy): https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip

**Chinese models:**
- Small (fast, good for Mandarin): https://alphacephei.com/vosk/models/vosk-model-small-cn-0.22.zip
- Full (slower, better accuracy): https://alphacephei.com/vosk/models/vosk-model-cn-0.22.zip

Download and extract the model:
```bash
# Create cache directory
mkdir -p /root/.cache/vosk

# Download English small model
wget https://alphacephei.com/vosk/models/vosk-model-small-en-us-0.15.zip
unzip vosk-model-small-en-us-0.15.zip -d /root/.cache/vosk/

# Or download full English model for better accuracy
# wget https://alphacephei.com/vosk/models/vosk-model-en-us-0.22.zip
# unzip vosk-model-en-us-0.22.zip -d /root/.cache/vosk/
```

### Step 3: Configure StudyForge

Add the following to your `.env` file:

```env
# Enable audio transcription
ENABLE_VOSK_TRANSCRIBER=true

# Path to your vosk model directory
# For English:
VOSK_MODEL_PATH=/root/.cache/vosk/vosk-model-small-en-us-0.15

# For other languages, download the appropriate model from https://alphacephei.com/vosk/models
```

## Usage

1. **Upload Audio File**
   - Click the "+" button in the Sources panel
   - Drag and drop or browse for your audio file
   - Supported formats: MP3, WAV, M4A, etc.

2. **Automatic Transcription**
   - The audio file is automatically transcribed using vosk-transcriber
   - The transcribed text is stored as the source content
   - The source type is set to "audio"

3. **Chat with Transcribed Content**
   - Switch to the CHAT tab
   - Ask questions about the transcribed audio content
   - Responses include references to the audio source

## Example Workflow

```
1. Upload lecture.mp3
   ↓
2. Automatic transcription (takes 1-5 minutes depending on file size)
   ↓
3. Transcribed text is ingested into vector store
   ↓
4. Ask questions: "What were the main points discussed?"
   ↓
5. Get answers with references to the audio content
```

## Performance Notes

- **Processing time**: ~1 minute per 10 minutes of audio
- **File size limit**: Configured via MAX_UPLOAD_SIZE (default: 200MB)
- **Language support**: Depends on the vosk model you download
- **Quality**: Vosk provides good accuracy for clear speech

## Troubleshooting

### Error: "vosk-transcriber not found"

Make sure vosk-transcriber is installed and in your PATH:
```bash
vosk-transcriber --help
```

### Error: "vosk-transcriber is disabled"

Set `ENABLE_VOSK_TRANSCRIBER=true` in your `.env` file.

### Poor transcription quality

- Try using a larger vosk model (less "small" in the model name)
- Ensure the audio quality is good (clear speech, minimal background noise)
- Use the correct language model for your audio content

## Alternative Solutions

If vosk-transcriber doesn't work for your needs, you can:

1. **Use cloud services**: Upload already-transcribed text files
2. **Use other tools**: Transcribe with Whisper API, Google Speech-to-Text, etc.
3. **Manual transcription**: Paste transcribed text directly as a text source

## Configuration Options

```env
# Enable/disable audio transcription
ENABLE_VOSK_TRANSCRIBER=true

# Path to vosk model (English example)
VOSK_MODEL_PATH=/root/.cache/vosk/vosk-model-small-en-us-0.15

# Maximum file upload size (bytes)
MAX_UPLOAD_SIZE=209715200  # 200MB
```

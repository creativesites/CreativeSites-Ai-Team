# MeetingMind Verified Architecture & Technical Boundaries

## 1. Stack & Toolchain
- **Language**: Kotlin 2.2.21 (Compose Compiler integrated)
- **Framework**: Jetpack Compose, Material 3, Navigation Compose
- **Android Target**: `compileSdk = 36`, `targetSdk = 36`, `minSdk = 24`, `versionCode = 47`, `versionName = "1.0-v47"`
- **Build System**: Gradle 9.3.1
  - **Memory Requirement**: In-process Kotlin compilation (`kotlin.compiler.execution.strategy=in-process`). Full compile and test runs **must** allocate `-Xmx6g --max-workers=4` (`org.gradle.jvmargs`). A 2GB heap crashes with `OutOfMemoryError: Java heap space`.
- **Packaging Variants**:
  - `debug`: Application ID `com.craftflowtechnologies.meetingmind.dev`, signed with committed `dev-debug.keystore`, `COMPANION_LIVE_WHISPER=true`. Installs alongside production.
  - `release`: Application ID `com.craftflowtechnologies.meetingmind`, signed with upload key from environment (`KEYSTORE_PATH`), `isMinifyEnabled=false`, Proguard rules active.

## 2. Core Subsystems & Modules
- **Storage & Database**:
  - Room DB: `MeetMindDatabase` (`VERSION = 27`). Managed migrations (latest `MIGRATION_26_27` adding `transcript_translations` table for non-destructive multilingual translation).
  - DataStore: `UserPreferences` (`appLanguage`, `aiResponseLanguage`, `autoDetectLanguage`), `GeminiCredentialStore` (shared process singleton; tests must tear down), `TieringModeStore` (`CLOSED_TESTING` vs `PRODUCTION`).
- **Audio Capture & Pipeline**:
  - `AudioRecorder`: 16kHz PCM mono WAV recording with lifecycle stall detection.
  - `MeetingProcessingPipeline`: Orchestrates silence detection, speaker diarization/clustering, multi-engine speech recognition, and structured note extraction.
  - `MeetingProcessingWorker`: WorkManager foreground worker ensuring audio transcription survives process backgrounding.
- **Speech Recognition (ASR)**:
  - System ASR: Native Android recognizer.
  - Sherpa-ONNX Whisper (`SherpaWhisperSpeechRecognizer`): Offline Whisper Turbo and Whisper Large-v3 INT8 models.
  - Sherpa-ONNX Omnilingual (`SherpaOmnilingualSpeechRecognizer`): Meta Omnilingual CTC 300M and 1B INT8 models for African languages (Shona, Ndebele, Bemba, Nyanja/Chichewa).
- **AI Intelligence & Routing**:
  - Cloud Gemini: Direct BYOK or managed proxy (`server/gemini-proxy`).
  - Fallback Cloud LLM: DeepSeek via rate-limiting proxy (`server/deepseek-proxy`).
  - On-Device Reasoning: `DeepSeek-R1-Distill-Qwen-1.5B` via ONNX runtime.
- **Circles Cloud Architecture**:
  - Cloudflare Worker (`server/circles-api`): REST endpoints for circle membership, feed posts, comment threads, and typing indicators.
  - Cloudflare R2: `meetingmind-circles-media` bucket for images, audio waveforms, and video clips.
  - Firebase Auth: Anonymous sign-in with optional Google account linking.

## 3. Critical Architectural Constraints & Gotchas
1. **Robolectric Looper Timing**: Loops relying on `Dispatchers.IO` callbacks require explicit `ShadowLooper.idleMainLooper(50, TimeUnit.MILLISECONDS)`.
2. **Companion Animation Loop**: In tests showing the companion, wrap with `CompositionLocalProvider(LocalCompanionReducedMotion provides true, LocalCompanionForceCanvas provides true)` to prevent perpetual recomposition.
3. **Color Literal Guard**: Direct `Color(0x...)` calls outside `ui/theme` violate `ColorLiteralGuardTest`. Always reference `MM.colors` or tokens in `FixedColors.kt`.
4. **Credential Security**: APK scan with `grep -raoE "AIza...|sk-..."` is mandatory before publishing.

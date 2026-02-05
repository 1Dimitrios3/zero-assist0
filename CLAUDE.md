# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Google Calendar Setup Guide

### Step 1: Create Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click **Select a project** → **New Project**
3. Enter a project name (e.g., "Zero Assist") → **Create**

### Step 2: Enable Google Calendar API

1. Go to **APIs & Services** → **Library**
2. Search for "Google Calendar API"
3. Click on it → **Enable**

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** → **Create**
3. Fill in required fields:
   - App name: "Zero Assist" (or your app name)
   - User support email: your email
   - Developer contact email: your email
4. Click **Save and Continue**
5. On **Scopes** page, click **Add or Remove Scopes** (Optional)
6. Add scope: `https://www.googleapis.com/auth/calendar` (Optional)
7. Click **Save and Continue**
8. On **Audience** page, click **Add Users**
9. Add your email address as a test user
10. Click **Save and Continue**

### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **+ Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Name: "Zero Assist Web Client"
5. Under **Authorized redirect URIs**, add:
   ```
   http://localhost:3000/api/auth/google/callback
   ```
6. Click **Create**
7. Copy the **Client ID** and **Client Secret**

### Step 5: Configure Environment Variables

Add to your `.env` file:

```env
GOOGLE_CLIENT_ID=your-client-id-here
GOOGLE_CLIENT_SECRET=your-client-secret-here
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback
MODEL_ID=the_model_id_of_your_preference
```

### Step 6: Connect Your Google Calendar

1. Start the app: `pnpm dev`
2. Visit: http://localhost:3000/api/auth/google
3. Google will show a consent screen (may show "unverified app" warning)
4. Click **Advanced** → **Go to [app name] (unsafe)**
5. Grant calendar permissions
6. You'll be redirected back with `?success=google_connected`

### Usage

Once connected, you can ask the AI:
- "What's on my calendar today?"
- "Show me my events for this week"
- "Schedule a meeting tomorrow at 2pm called Team Standup"
- "Update my 3pm meeting to 4pm"
- "Delete my dentist appointment"
- "Search for meetings with John"
- "Create a meeting with a 10 minute reminder"
- "Schedule a call and invite john@example.com"
- "Create a daily standup at 9am for the next 5 occurrences"
- "Schedule a weekly team sync every Monday and Thursday at 12pm for the whole year"

## Development Commands

```bash
pnpm dev          # Start dev server with Turbopack
pnpm build        # Build for production
pnpm lint         # Run ESLint
npx tsc --noEmit  # Type check
```

## Architecture

- **`/src/app/api/chat/route.ts`** - Chat API with calendar tools
- **`/src/app/api/chat/prompts.ts`** - System prompt and constants
- **`/src/app/api/auth/google/`** - OAuth flow endpoints
- **`/src/lib/google-calendar.ts`** - Google Calendar API wrapper
- **`/src/lib/calendar-tools.ts`** - AI SDK tool definitions
- **`/src/app/chat.tsx`** - Chat UI component
- **`/src/app/utils/message-utils.ts`** - Message filtering helpers
- **`/src/types/messages.ts`** - Type definitions for messages

## References

- [AI SDK Docs](https://ai-sdk.dev/docs)
- [Google Calendar API](https://developers.google.com/calendar/api)
- [Google OAuth 2.0](https://developers.google.com/identity/protocols/oauth2)

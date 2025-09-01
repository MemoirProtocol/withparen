# Authentication Removal Changes

This document outlines the changes made to remove the sign-in requirement from the Seren plugin, allowing users to directly access the chat functionality and create connections without authentication.

## Changes Made

### 1. Updated `createConnection` Action (`src/actions/createConnection.ts`)

**Before**: Required a Person node with email property to validate the action
**After**: Skips authentication check and allows connection creation for any non-empty message

Key changes:

- Modified `validate()` function to always return `true` for non-empty messages
- Updated handler to create a basic Person node if one doesn't exist
- Commented out authentication logic for future restoration if needed

### 2. Updated Onboarding Provider (`src/providers/onboarding.ts`)

**Before**: Checked for authenticated Person node to determine conversation flow
**After**: Always proceeds to connection creation flow without authentication

Key changes:

- Set `hasPersonWithWebIdAndEmail = true` to skip authentication check
- Updated context to reflect new intriguing question and flow
- Commented out database check logic for future restoration if needed

### 3. Updated Conversation Flow

The new flow reflects the updated intriguing question:

> "I'm Seren. Think of someone important to you—what's one way you'd love to deepen that relationship?"

With response options:

- I want to communicate better with my partner
- Understand what motivates my teenage daughter
- Be more supportive when my friend is struggling
- Rebuild trust with someone I've grown distant from
- Custom response

### 4. Updated Tests

- Modified `createConnection.test.ts` to reflect new validation behavior
- Updated `onboarding.test.ts` to test the authentication-skipped flow
- All tests now pass with the new behavior

## Flow Summary

1. **User arrives at chat**: No sign-in required
2. **Intriguing question**: User answers relationship deepening question
3. **Narrative conversation**: Seren engages in supportive dialogue about their relationship goal
4. **Connection creation**: When ready, Seren explains the Telegram process and asks for:
   - Partner's name
   - User's name (if not already mentioned)
   - Shared secret
5. **CREATE_CONNECTION action**: Automatically triggered when all information is collected

## Technical Notes

- Person nodes are created automatically without email when needed
- All authentication-related code is commented out, not deleted, for easy restoration
- The `CREATE_CONNECTION` action now works without requiring a pre-authenticated user
- Database operations still work the same way, just without the email requirement

## Future Considerations

If authentication needs to be restored in the future:

1. Uncomment the authentication logic in both files
2. Restore the original test expectations
3. Update the conversation flow to include sign-in steps

The changes are designed to be easily reversible while maintaining all existing functionality.

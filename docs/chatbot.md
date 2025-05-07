# Camping Spot Finder Chatbot Documentation

## Overview

The Camping Spot Finder Chatbot is an interactive conversational assistant that helps users find camping spots based on their preferences. The chatbot maintains conversation state, remembers user preferences, and provides contextual responses to create a natural, helpful experience.

## Features

- **Conversational State Management**: Maintains context across multiple messages in a session
- **Natural Language Processing**: Extracts camping preferences from natural language
- **FAQ Handling**: Automatically detects and answers frequently asked questions
- **Follow-up Questions**: Intelligently asks for missing information when needed
- **Preference Tracking**: Remembers user preferences like location, date range, and amenities
- **Contextual Responses**: Generates responses based on the current conversation state

## API Endpoints

### POST /chatbot/message

Process a user message and return a response.

#### Request

```json
{
  "message": "I'm looking for a camping spot near a lake in June",
  "sessionId": "user123"  // Optional, defaults to 'anonymous'
}
```

#### Response

```json
{
  "response": "I found several camping spots near lakes. They're available for your dates in June. Would you like me to show you these options?"
}
```

## Conversation States

The chatbot maintains the following states:

- **INITIAL**: Starting state for new conversations
- **ASKING_LOCATION**: Asking for location information
- **ASKING_DATES**: Asking for date information
- **ASKING_AMENITIES**: Asking for preferred amenities
- **ASKING_PRICE**: Asking for price range
- **ASKING_GUESTS**: Asking for guest count

## User Preferences

The chatbot extracts and remembers the following user preferences:

- **Location**: City, region, or specific area
- **Date Range**: Check-in and check-out dates
- **Price Range**: Minimum and maximum price per night
- **Amenities**: Features like WiFi, showers, electricity, etc.
- **Nearby Features**: Natural features like lakes, forests, beaches
- **Guest Count**: Number of people in the group

## FAQ Handling

The chatbot automatically detects and answers common questions about:

- Booking process
- Pricing information
- Popular amenities
- Cancellation policies
- Pet policies

## Example Conversations

### Basic Search

**User**: "I'm looking for a camping spot near a lake in June"  
**Bot**: "I found several camping spots near lakes. They're available for your dates in June. Would you like me to show you these options?"

**User**: "Yes, but I need WiFi"  
**Bot**: "Great! I found lakeside camping spots with WiFi available in June. Would you like to see these options?"

### FAQ Example

**User**: "What's your cancellation policy?"  
**Bot**: "Our cancellation policy allows free cancellation up to 7 days before your check-in date. Cancellations made less than 7 days before check-in may be subject to a fee of one night's stay. Some hosts have stricter policies, which will be clearly marked on their listings."

## Implementation Details

The chatbot uses several helper functions:

- **extractKeywords()**: Extracts camping preferences from natural language
- **processDates()**: Identifies date ranges in user messages
- **checkForFAQ()**: Detects if a message is asking an FAQ
- **getConversation()**: Retrieves or creates a conversation state for a user
- **handleFollowUp()**: Processes follow-up questions based on current state
- **generateFollowUpQuestion()**: Creates appropriate follow-up questions

## Development and Maintenance

### Adding New FAQs

Add new patterns and responses to the FAQ array in the checkForFAQ function:

```javascript
const faqs = [
  {
    pattern: /cancellation policy/i,
    answer: "Our cancellation policy allows free cancellation..."
  },
  // Add new FAQs here
];
```

### Adding New Natural Features

To support new natural features, update the extractKeywords function and ensure the response handling includes appropriate content for the new feature.
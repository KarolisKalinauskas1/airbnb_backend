// Enhanced chatbot implementation using NLP.js
const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');
const { NlpManager, SentimentAnalyzer } = require('node-nlp'); // Add sentiment analyzer

// State management for ongoing conversations
const activeConversations = new Map();

// Conversation history for complex context tracking
const conversationHistory = new Map();

// Initialize sentiment analyzer
const sentimentAnalyzer = new SentimentAnalyzer({ language: 'en' });

// Get or create conversation state for this user
function getConversation(userId) {
  if (!activeConversations.has(userId)) {
    activeConversations.set(userId, {
      state: 'initial',
      preferences: {
        dateRange: { startDate: null, endDate: null },
        location: null,
        guestCount: null,
        priceRange: { min: null, max: null },
        amenities: [],
        nearbyFeatures: [],
        previousSearches: [], // Track past searches
        rejectedRecommendations: [], // Track rejected recommendations
      },
      lastActivity: Date.now(),
      context: {},
      conversationMetrics: {
        messageCount: 0,
        questionCount: 0,
        sentimentScores: []
      }
    });
    
    // Initialize conversation history
    conversationHistory.set(userId, []);
  }
  
  // Update last activity timestamp
  const conversation = activeConversations.get(userId);
  conversation.lastActivity = Date.now();
  conversation.conversationMetrics.messageCount++;
  return conversation;
}

// Add message to conversation history
function addToConversationHistory(userId, role, message, entities = {}) {
  if (!conversationHistory.has(userId)) {
    conversationHistory.set(userId, []);
  }
  
  const history = conversationHistory.get(userId);
  history.push({
    role,
    message,
    entities,
    timestamp: new Date()
  });
  
  // Keep history to a reasonable size (last 20 messages)
  if (history.length > 20) {
    history.shift();
  }
}

// Get conversation history
function getConversationHistory(userId, limit = 5) {
  if (!conversationHistory.has(userId)) {
    return [];
  }
  
  const history = conversationHistory.get(userId);
  return history.slice(-limit);
}

// Clean up old conversations (called periodically)
function cleanupConversations() {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  for (const [userId, conversation] of activeConversations.entries()) {
    if (now - conversation.lastActivity > timeout) {
      activeConversations.delete(userId);
      conversationHistory.delete(userId); // Also clean up history
    }
  }
}

// Set up periodic cleanup
setInterval(cleanupConversations, 10 * 60 * 1000); // Every 10 minutes

// Initialize NLP Manager - more advanced than the previous classifier
const nlpManager = new NlpManager({ 
  languages: ['en'],
  forceNER: true,
  nlu: { log: false }
});

// Function to initialize and train the NLP model
async function setupNlpManager() {
  try {
    // Try to load an existing model if available
    try {
      nlpManager.load('./models/camping-model.nlp');
      console.log('Loaded existing NLP model');
      return;
    } catch (err) {
      console.log('No existing model found, training a new one...');
    }

    // Add documents for intent recognition - camping related
    // Location intents
    nlpManager.addDocument('en', 'find camping near %location%', 'search.location');
    nlpManager.addDocument('en', 'camping spots in %location%', 'search.location');
    nlpManager.addDocument('en', 'camping near %location%', 'search.location');
    nlpManager.addDocument('en', 'places to camp around %location%', 'search.location');
    nlpManager.addDocument('en', 'campgrounds in %location%', 'search.location');
    nlpManager.addDocument('en', 'camping sites near %location%', 'search.location');
    
    // Amenity intents
    nlpManager.addDocument('en', 'camping with %amenity%', 'search.amenity');
    nlpManager.addDocument('en', 'find spots with %amenity%', 'search.amenity');
    nlpManager.addDocument('en', 'places that have %amenity%', 'search.amenity');
    nlpManager.addDocument('en', 'camping spots that offer %amenity%', 'search.amenity');
    nlpManager.addDocument('en', 'sites with %amenity% available', 'search.amenity');
    nlpManager.addDocument('en', 'need a camping spot with %amenity%', 'search.amenity');
    
    // Natural feature intents
    nlpManager.addDocument('en', 'camping near a %feature%', 'search.feature');
    nlpManager.addDocument('en', 'camping spots close to a %feature%', 'search.feature');
    nlpManager.addDocument('en', 'find a spot near a %feature%', 'search.feature');
    nlpManager.addDocument('en', 'camping by the %feature%', 'search.feature');
    nlpManager.addDocument('en', 'sites near a %feature%', 'search.feature');
    
    // Price intents
    nlpManager.addDocument('en', 'camping under %price%', 'search.price');
    nlpManager.addDocument('en', 'affordable camping spots', 'search.price');
    nlpManager.addDocument('en', 'cheap camping sites', 'search.price');
    nlpManager.addDocument('en', 'camping spots for less than %price%', 'search.price');
    nlpManager.addDocument('en', 'budget camping under %price%', 'search.price');
    nlpManager.addDocument('en', 'campsites that cost less than %price%', 'search.price');
    
    // Date intents
    nlpManager.addDocument('en', 'camping in %date%', 'search.date');
    nlpManager.addDocument('en', 'available camping for %date%', 'search.date');
    nlpManager.addDocument('en', 'spots available in %date%', 'search.date');
    nlpManager.addDocument('en', 'find camping for %date%', 'search.date');
    nlpManager.addDocument('en', 'camping trips in %date%', 'search.date');
    
    // Guest count intents
    nlpManager.addDocument('en', 'camping for %number% people', 'search.guests');
    nlpManager.addDocument('en', 'spot for %number% campers', 'search.guests');
    nlpManager.addDocument('en', 'camping with %number% friends', 'search.guests');
    nlpManager.addDocument('en', 'site that fits %number% people', 'search.guests');
    
    // Multi-criteria intents (NEW)
    nlpManager.addDocument('en', 'camping for %number% people near %location% with %amenity%', 'search.multi');
    nlpManager.addDocument('en', 'find a spot with %amenity% near %feature% for %number% people', 'search.multi');
    nlpManager.addDocument('en', 'camping near %feature% with %amenity% under %price%', 'search.multi');
    nlpManager.addDocument('en', '%location% camping with %amenity% for less than %price%', 'search.multi');
    
    // Feedback intents (NEW)
    nlpManager.addDocument('en', 'I like this one', 'feedback.positive');
    nlpManager.addDocument('en', 'this looks great', 'feedback.positive');
    nlpManager.addDocument('en', 'perfect spot', 'feedback.positive');
    nlpManager.addDocument('en', 'exactly what I need', 'feedback.positive');
    
    nlpManager.addDocument('en', 'I don\'t like these', 'feedback.negative');
    nlpManager.addDocument('en', 'show me something else', 'feedback.negative');
    nlpManager.addDocument('en', 'not what I\'m looking for', 'feedback.negative');
    nlpManager.addDocument('en', 'these aren\'t good', 'feedback.negative');
    
    // Comparison intents (NEW)
    nlpManager.addDocument('en', 'which one has better %amenity%', 'comparison');
    nlpManager.addDocument('en', 'compare these spots', 'comparison');
    nlpManager.addDocument('en', 'which one is cheaper', 'comparison.price');
    nlpManager.addDocument('en', 'which one is closer to %feature%', 'comparison.feature');
    
    // FAQ intents
    nlpManager.addDocument('en', 'how do I book', 'faq.booking');
    nlpManager.addDocument('en', 'booking process', 'faq.booking');
    nlpManager.addDocument('en', 'make a reservation', 'faq.booking');
    nlpManager.addDocument('en', 'how to reserve', 'faq.booking');
    
    nlpManager.addDocument('en', 'cancellation policy', 'faq.cancellation');
    nlpManager.addDocument('en', 'how to cancel', 'faq.cancellation');
    nlpManager.addDocument('en', 'refund policy', 'faq.cancellation');
    nlpManager.addDocument('en', 'cancel my booking', 'faq.cancellation');
    
    nlpManager.addDocument('en', 'pet policy', 'faq.pets');
    nlpManager.addDocument('en', 'can I bring my dog', 'faq.pets');
    nlpManager.addDocument('en', 'are pets allowed', 'faq.pets');
    nlpManager.addDocument('en', 'pet friendly camping', 'faq.pets');
    
    nlpManager.addDocument('en', 'check-in time', 'faq.checkin');
    nlpManager.addDocument('en', 'when can I arrive', 'faq.checkin');
    nlpManager.addDocument('en', 'check-out time', 'faq.checkin');
    nlpManager.addDocument('en', 'arrival time', 'faq.checkin');
    
    // Clarification intents (NEW)
    nlpManager.addDocument('en', 'what do you mean', 'clarification');
    nlpManager.addDocument('en', 'I don\'t understand', 'clarification');
    nlpManager.addDocument('en', 'can you explain', 'clarification');
    nlpManager.addDocument('en', 'what is that', 'clarification');
    
    // Named entities - Add entities for better extraction
    // Natural features
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'lake', ['lake', 'lakes', 'lakeside']);
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'river', ['river', 'rivers', 'riverside', 'stream']);
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'beach', ['beach', 'beaches', 'coastline', 'ocean', 'sea']);
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'forest', ['forest', 'forests', 'woods', 'woodland']);
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'mountain', ['mountain', 'mountains', 'hill', 'hills']);
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'waterfall', ['waterfall', 'waterfalls', 'cascade']);
    
    // More specific natural entities (NEW)
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'canyon', ['canyon', 'canyons', 'gorge', 'ravine']);
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'desert', ['desert', 'deserts', 'arid landscape']);
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'valley', ['valley', 'valleys', 'dale', 'glen']);
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'meadow', ['meadow', 'meadows', 'grassland', 'field']);
    nlpManager.addNerRuleOptionTexts('en', 'feature', 'cave', ['cave', 'caves', 'cavern', 'grotto']);
    
    // Country entities (NEW)
    nlpManager.addNerRuleOptionTexts('en', 'country', 'Belgium', ['belgium', 'belgian']);
    nlpManager.addNerRuleOptionTexts('en', 'country', 'Netherlands', ['netherlands', 'holland', 'dutch']);
    nlpManager.addNerRuleOptionTexts('en', 'country', 'France', ['france', 'french']);
    nlpManager.addNerRuleOptionTexts('en', 'country', 'Germany', ['germany', 'german']);
    nlpManager.addNerRuleOptionTexts('en', 'country', 'Luxembourg', ['luxembourg', 'luxembourgish']);
    
    // Amenities - Add all possible amenities from database
    try {
      const dbAmenities = await prisma.amenities.findMany();
      
      // Create entity recognizers for all actual available amenities in the database
      dbAmenities.forEach(amenity => {
        const name = amenity.name.toLowerCase();
        let synonyms = [];
        
        // Add common synonyms for amenities
        switch (name) {
          case 'wifi':
            synonyms = ['wifi', 'internet', 'connection', 'online access', 'wireless internet', 'web access'];
            break;
          case 'shower':
            synonyms = ['shower', 'showers', 'washing facilities', 'bathroom', 'bath'];
            break;
          case 'electricity':
            synonyms = ['electricity', 'electric', 'power', 'outlet', 'charging', 'electrical hookup'];
            break;
          case 'campfire':
            synonyms = ['campfire', 'fire pit', 'bonfire', 'fireplace', 'fire ring', 'fire area'];
            break;
          case 'parking':
            synonyms = ['parking', 'car park', 'parking space', 'vehicle parking', 'car space'];
            break;
          case 'toilet':
            synonyms = ['toilet', 'toilets', 'restroom', 'bathroom', 'wc', 'lavatory'];
            break;
          case 'kitchen':
            synonyms = ['kitchen', 'cooking facilities', 'cooking area', 'stove', 'cooking space'];
            break;
          case 'pet friendly':
            synonyms = ['pet friendly', 'dog friendly', 'pets allowed', 'pet accommodating', 'allows pets'];
            break;
          default:
            synonyms = [name]; // Default to just the name itself
        }
        
        // Add to NER with synonyms
        nlpManager.addNerRuleOptionTexts('en', 'amenity', amenity.name, synonyms);
      });
      
      console.log(`Added ${dbAmenities.length} database amenities to NER rules`);
    } catch (error) {
      console.error('Error loading amenities from database:', error);
      // Add some default amenities as fallback
      nlpManager.addNerRuleOptionTexts('en', 'amenity', 'WiFi', ['wifi', 'internet', 'connection', 'online access']);
      nlpManager.addNerRuleOptionTexts('en', 'amenity', 'Shower', ['shower', 'showers', 'washing facilities']);
      nlpManager.addNerRuleOptionTexts('en', 'amenity', 'Electricity', ['electricity', 'electric', 'power', 'outlet']);
    }
    
    // Date entities (NEW)
    nlpManager.addNerRuleOptionTexts('en', 'date', 'summer', ['summer', 'july', 'august', 'june']);
    nlpManager.addNerRuleOptionTexts('en', 'date', 'winter', ['winter', 'december', 'january', 'february']);
    nlpManager.addNerRuleOptionTexts('en', 'date', 'spring', ['spring', 'march', 'april', 'may']);
    nlpManager.addNerRuleOptionTexts('en', 'date', 'fall', ['fall', 'autumn', 'september', 'october', 'november']);
    nlpManager.addNerRuleOptionTexts('en', 'date', 'weekend', ['weekend', 'saturday', 'sunday']);
    nlpManager.addNerRuleOptionTexts('en', 'date', 'weekday', ['weekday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday']);
    
    // Train the NLP model
    await nlpManager.train();
    
    // Save the model to a file so we don't have to retrain each time
    nlpManager.save('./models/camping-model.nlp');
    console.log('NLP Model trained and saved');
  } catch (error) {
    console.error('Error setting up NLP manager:', error);
  }
}

// Initialize the NLP model when the server starts
setupNlpManager();

// Improved amenity validation with database lookup
async function validateAmenitiesAgainstDatabase(amenities) {
  if (!amenities || amenities.length === 0) {
    return { valid: [], invalid: [] };
  }
  
  try {
    // Query the database to get a count of camping spots for each amenity
    const amenityCounts = await Promise.all(
      amenities.map(async (amenity) => {
        const count = await prisma.camping_spot_amenities.count({
          where: {
            amenity: {
              name: {
                equals: amenity,
                mode: 'insensitive'
              }
            }
          }
        });
        
        return { amenity, count };
      })
    );
    
    // Separate valid (available) and invalid (unavailable) amenities
    const valid = amenityCounts
      .filter(item => item.count > 0)
      .map(item => item.amenity);
      
    const invalid = amenityCounts
      .filter(item => item.count === 0)
      .map(item => item.amenity);
    
    return { valid, invalid };
  } catch (error) {
    console.error('Error validating amenities:', error);
    // If there's an error, assume all amenities are valid to avoid breaking the flow
    return { valid: amenities, invalid: [] };
  }
}

// Function to find alternative amenities for unavailable ones
async function suggestAlternativeAmenities(unavailableAmenities) {
  // Map of alternatives for common amenities
  const alternativeMap = {
    'Campfire': ['Fire pit', 'BBQ grill', 'Outdoor cooking area'],
    'WiFi': ['4G coverage', 'Internet access', 'Cell service'],
    'Shower': ['Bathroom', 'Washing facilities'],
    'Hiking trails': ['Walking paths', 'Nature trails', 'Outdoor activities'],
    'Swimming pool': ['Lake access', 'River access', 'Swimming area'],
    'Pet friendly': ['Dog walking area', 'Animal friendly'],
    'Kitchen': ['Cooking area', 'Stove', 'Cooking facilities'],
    'Hot tub': ['Spa', 'Jacuzzi', 'Heated pool'],
    'Air conditioning': ['Fans', 'Cool ventilation', 'Climate control'],
    'Playground': ['Kids area', 'Recreational area', 'Children\'s facilities']
  };
  
  const suggestions = {};
  
  // For each unavailable amenity, find alternatives that actually exist in the database
  for (const amenity of unavailableAmenities) {
    const alternatives = alternativeMap[amenity] || [];
    
    if (alternatives.length > 0) {
      // Check which alternatives actually exist in the database
      const { valid } = await validateAmenitiesAgainstDatabase(alternatives);
      
      if (valid.length > 0) {
        suggestions[amenity] = valid;
      }
    }
  }
  
  return suggestions;
}

// New: Process user message with advanced entity extraction and sentiment analysis
async function processNlpMessage(message, sessionId = 'anonymous') {
  try {
    // Process the message with NLP.js
    const response = await nlpManager.process('en', message);
    
    // Analyze sentiment
    const sentiment = await sentimentAnalyzer.getSentiment(message);
    
    // Extract entities from the response
    const entities = {
      location: null,
      amenities: [],
      features: [],
      priceRange: { min: null, max: null },
      guestCount: null,
      dateRange: { startDate: null, endDate: null },
      countries: [],
      questions: message.includes('?'), // Detect questions
      sentiment: sentiment, // Add sentiment analysis
      multiPart: false,
      confidence: response.score
    };
    
    // Check for multi-part query (contains multiple search criteria)
    if (response.intent === 'search.multi') {
      entities.multiPart = true;
    }
    
    // Extract entities from the NLP response
    if (response.entities && response.entities.length > 0) {
      // Track entity confidence scores
      const entityConfidence = {};
      
      for (const entity of response.entities) {
        // Track confidence for this entity type
        if (!entityConfidence[entity.entity]) {
          entityConfidence[entity.entity] = [];
        }
        entityConfidence[entity.entity].push(entity.accuracy || 1);
        
        switch (entity.entity) {
          case 'location':
            entities.location = entity.sourceText;
            break;
          case 'amenity':
            entities.amenities.push(entity.option);
            break;
          case 'feature':
            entities.features.push(entity.option);
            break;
          case 'number':
            // Assume it's guest count if intent is about guests
            if (response.intent === 'search.guests' || response.intent === 'search.multi') {
              entities.guestCount = parseInt(entity.sourceText);
            }
            break;
          case 'price':
            // For price, we need to check the intent to determine min or max
            if (response.intent === 'search.price' || response.intent === 'search.multi') {
              // Default to max price (most common use case)
              entities.priceRange.max = parseInt(entity.sourceText.replace(/[^0-9]/g, ''));
            }
            break;
          case 'country':
            entities.countries.push(entity.option);
            break;
          case 'date':
            // Simple date handling - would be expanded in full implementation
            const currentDate = new Date();
            const dates = processDates(entity.option, currentDate);
            if (dates) {
              entities.dateRange = dates;
            }
            break;
        }
      }
      
      // Calculate average confidence for each entity type
      for (const entityType in entityConfidence) {
        const scores = entityConfidence[entityType];
        const avgConfidence = scores.reduce((a, b) => a + b, 0) / scores.length;
        entities[`${entityType}Confidence`] = avgConfidence;
      }
    }
    
    // Process dates from message - handle more date formats
    const dates = processDates(message, new Date());
    if (dates && !entities.dateRange.startDate) {
      entities.dateRange = dates;
    }
    
    // Extract locations using regex for cases where NER might miss
    if (!entities.location) {
      const locationRegex = /\b(?:in|near|at|around|close to)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b/g;
      const matches = message.match(locationRegex);
      
      if (matches && matches.length > 0) {
        const match = matches[0];
        const parts = match.split(/\s+/);
        // Remove the preposition and get the location
        if (parts.length >= 2) {
          entities.location = parts.slice(1).join(' ');
          entities.locationConfidence = 0.7; // Lower confidence for regex match
        }
      }
    }
    
    // Validate amenities against the database
    if (entities.amenities.length > 0) {
      const { valid, invalid } = await validateAmenitiesAgainstDatabase(entities.amenities);
      
      // Update with only valid amenities
      entities.amenities = valid;
      
      // Generate alternatives for invalid amenities
      if (invalid.length > 0) {
        const alternatives = await suggestAlternativeAmenities(invalid);
        entities.invalidAmenities = invalid;
        entities.alternativeAmenities = alternatives;
      }
    }
    
    // Return the processing result
    return {
      intent: response.intent,
      score: response.score,
      entities: entities,
      utterance: message,
      sentiment
    };
  } catch (error) {
    console.error('Error processing message with NLP:', error);
    return {
      intent: 'error',
      score: 0,
      entities: { sentiment: 0 },
      utterance: message,
      error: error.message
    };
  }
}

// Convert dates from text to actual date objects
function processDates(input, referenceDate) {
  // Current implementation is simplified - would be expanded in full version
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june', 
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  const now = referenceDate || new Date();
  const currentYear = now.getFullYear();
  
  // Check for seasons
  if (/summer/i.test(input)) {
    const startDate = new Date(currentYear, 5, 21); // June 21
    const endDate = new Date(currentYear, 8, 22);   // September 22
    return { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] };
  }
  
  if (/winter/i.test(input)) {
    const startDate = new Date(currentYear, 11, 21); // December 21
    const endDate = new Date(currentYear + 1, 2, 20); // March 20 next year
    return { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] };
  }
  
  if (/spring/i.test(input)) {
    const startDate = new Date(currentYear, 2, 20); // March 20
    const endDate = new Date(currentYear, 5, 20);   // June 20
    return { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] };
  }
  
  if (/fall|autumn/i.test(input)) {
    const startDate = new Date(currentYear, 8, 23); // September 23
    const endDate = new Date(currentYear, 11, 20);  // December 20
    return { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] };
  }
  
  // Check for months
  for (let i = 0; i < months.length; i++) {
    if (input.toLowerCase().includes(months[i])) {
      const startDate = new Date(currentYear, i, 1);
      // Last day of month
      const endDate = new Date(currentYear, i + 1, 0);
      return { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] };
    }
  }
  
  // Check for "this weekend"
  if (/this\s+weekend/i.test(input)) {
    const startDate = new Date();
    // Find the next Saturday
    startDate.setDate(startDate.getDate() + (6 - startDate.getDay()));
    const endDate = new Date(startDate);
    // Sunday is next day
    endDate.setDate(startDate.getDate() + 1);
    return { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] };
  }
  
  // Check for "next week"
  if (/next\s+week/i.test(input)) {
    const startDate = new Date();
    // Add 7 days to get to next week
    startDate.setDate(startDate.getDate() + 7);
    // Set to Monday of that week
    startDate.setDate(startDate.getDate() - startDate.getDay() + 1);
    const endDate = new Date(startDate);
    // End of week (Sunday)
    endDate.setDate(startDate.getDate() + 6);
    return { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] };
  }
  
  // Format: MM/DD or DD/MM
  const dateRegex = /(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/;
  const match = input.match(dateRegex);
  if (match) {
    // Assume MM/DD format but be flexible
    let month = parseInt(match[1]) - 1;
    let day = parseInt(match[2]);
    const year = match[3] ? (match[3].length === 2 ? 2000 + parseInt(match[3]) : parseInt(match[3])) : currentYear;
    
    // If first number is > 12, swap as it's likely DD/MM format
    if (month >= 12) {
      const temp = month;
      month = day - 1;
      day = temp + 1;
    }
    
    if (month >= 0 && month < 12 && day >= 1 && day <= 31) {
      const startDate = new Date(year, month, day);
      const endDate = new Date(startDate);
      endDate.setDate(startDate.getDate() + 2); // Default 3-day stay
      return { startDate: startDate.toISOString().split('T')[0], endDate: endDate.toISOString().split('T')[0] };
    }
  }
  
  return null;
}

// Generate empathetic response based on sentiment
function generateEmpathicResponse(sentiment) {
  if (sentiment > 0.5) {
    return [
      "I'm glad you're excited about finding a camping spot!",
      "That sounds like a wonderful plan!",
      "I'm here to help you find that perfect camping experience.",
      "Great! Let's find you an amazing camping spot."
    ][Math.floor(Math.random() * 4)];
  } else if (sentiment < -0.3) {
    return [
      "I understand finding the right camping spot can be frustrating. Let me help make it easier.",
      "I'm sorry you're having difficulty. Let's narrow down the options together.",
      "Let me help simplify this search for you.",
      "Don't worry, we'll find you a great spot that meets your needs."
    ][Math.floor(Math.random() * 4)];
  }
  return null;
}

// Handle messaging endpoint - Enhanced with NLP.js and sentiment analysis
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId = 'anonymous', userId = sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get or create conversation state for this user
    const conversation = getConversation(userId);
    
    // Process the message with NLP.js
    const nlpResponse = await processNlpMessage(message, userId);
    
    // Add to history
    addToConversationHistory(userId, 'user', message, nlpResponse.entities);
    
    // Track sentiment
    conversation.conversationMetrics.sentimentScores.push(nlpResponse.entities.sentiment);
    
    // Calculate average sentiment 
    const avgSentiment = conversation.conversationMetrics.sentimentScores.reduce((a, b) => a + b, 0) / 
                         conversation.conversationMetrics.sentimentScores.length;
    
    // If it's a question, increment question count
    if (nlpResponse.entities.questions) {
      conversation.conversationMetrics.questionCount++;
    }
    
    // Handle FAQ intents directly
    if (nlpResponse.intent && nlpResponse.intent.startsWith('faq.') && nlpResponse.score > 0.7) {
      let faqResponse = '';
      
      switch (nlpResponse.intent) {
        case 'faq.booking':
          faqResponse = "You can make a booking by selecting a camping spot, choosing your dates, and completing the checkout process with payment. Look for the 'Book' button on any camping spot page.";
          break;
        case 'faq.cancellation':
          faqResponse = "Cancellations made 7 days before check-in receive a full refund. Cancellations within 7 days receive a 50% refund.";
          break;
        case 'faq.pets':
          faqResponse = "Some camping spots are pet-friendly. Look for the 'Pet friendly' tag in the listing details or use the chatbot to find pet-friendly options.";
          break;
        case 'faq.checkin':
          faqResponse = "Check-in times vary by camping spot. Most locations allow check-in between 2pm and 6pm. Specific times will be displayed on your booking confirmation.";
          break;
        default:
          faqResponse = "I can help you with booking information, cancellations, pet policies, and check-in times. What would you like to know about?";
      }
      
      // Reset conversation to initial state for FAQs
      conversation.state = 'initial';
      
      // Add empathetic touch if needed based on sentiment
      const empathicPrefix = generateEmpathicResponse(nlpResponse.entities.sentiment);
      if (empathicPrefix) {
        faqResponse = `${empathicPrefix} ${faqResponse}`;
      }
      
      // Add response to history
      addToConversationHistory(userId, 'bot', faqResponse);
      
      return res.json({
        response: faqResponse,
        sentiment: nlpResponse.entities.sentiment,
        intent: nlpResponse.intent
      });
    }
    
    // Handle feedback intents
    if (nlpResponse.intent && nlpResponse.intent.startsWith('feedback.')) {
      let feedbackResponse = '';
      
      if (nlpResponse.intent === 'feedback.positive') {
        feedbackResponse = [
          "I'm glad you like this option! Would you like to see more details or make a booking?",
          "Great choice! This spot has been popular with other campers too.",
          "Excellent! Would you like me to show you similar camping spots?"
        ][Math.floor(Math.random() * 3)];
        
        conversation.context.lastPositiveFeedback = new Date();
      } else if (nlpResponse.intent === 'feedback.negative') {
        feedbackResponse = [
          "I understand this isn't what you're looking for. Let me find some different options.",
          "Let me try again with some alternative camping spots that might better suit your needs.",
          "Thanks for the feedback. What specifically are you looking for in a camping spot?"
        ][Math.floor(Math.random() * 3)];
        
        // Store the negative feedback to avoid similar recommendations
        if (conversation.context.lastRecommendations) {
          conversation.preferences.rejectedRecommendations = 
            conversation.preferences.rejectedRecommendations.concat(
              conversation.context.lastRecommendations.map(r => r.id)
            );
        }
      }
      
      // Add response to history
      addToConversationHistory(userId, 'bot', feedbackResponse);
      
      return res.json({
        response: feedbackResponse,
        sentiment: nlpResponse.entities.sentiment,
        intent: nlpResponse.intent
      });
    }
    
    // Update conversation with extracted entities
    if (nlpResponse.entities.location && (!conversation.preferences.location || nlpResponse.entities.locationConfidence > 0.8)) {
      conversation.preferences.location = nlpResponse.entities.location;
    }
    
    if (nlpResponse.entities.amenities.length > 0) {
      // Merge with existing amenities to avoid duplicates
      const uniqueAmenities = new Set([...conversation.preferences.amenities, ...nlpResponse.entities.amenities]);
      conversation.preferences.amenities = [...uniqueAmenities];
    }
    
    if (nlpResponse.entities.features.length > 0) {
      // Overwrite features if specified in this message
      conversation.preferences.nearbyFeatures = nlpResponse.entities.features;
    }
    
    if (nlpResponse.entities.countries.length > 0) {
      conversation.context.countries = nlpResponse.entities.countries;
    }
    
    if (nlpResponse.entities.guestCount && (!conversation.preferences.guestCount || conversation.preferences.guestCount < nlpResponse.entities.guestCount)) {
      conversation.preferences.guestCount = nlpResponse.entities.guestCount;
    }
    
    if (nlpResponse.entities.dateRange.startDate) {
      conversation.preferences.dateRange = nlpResponse.entities.dateRange;
    }
    
    if (nlpResponse.entities.priceRange.min !== null || nlpResponse.entities.priceRange.max !== null) {
      conversation.preferences.priceRange = {
        min: nlpResponse.entities.priceRange.min !== null ? 
             nlpResponse.entities.priceRange.min : 
             conversation.preferences.priceRange.min,
        max: nlpResponse.entities.priceRange.max !== null ? 
             nlpResponse.entities.priceRange.max : 
             conversation.preferences.priceRange.max
      };
    }
    
    // Generate a response based on extracted entities and conversation context
    let response = '';
    
    // Add empathetic start based on sentiment if appropriate
    const empathicPrefix = generateEmpathicResponse(nlpResponse.entities.sentiment);
    if (empathicPrefix) {
      response = empathicPrefix + ' ';
    }
    
    // If we have invalid amenities, provide alternatives
    if (nlpResponse.entities.invalidAmenities && nlpResponse.entities.invalidAmenities.length > 0) {
      const invalidAmenities = nlpResponse.entities.invalidAmenities;
      const alternatives = nlpResponse.entities.alternativeAmenities || {};
      
      response += `I noticed you asked for ${invalidAmenities.join(', ')}, but unfortunately, none of our current camping spots offer ${invalidAmenities.length > 1 ? 'these amenities' : 'this amenity'}. `;
      
      // Suggest alternatives if available
      let hasAlternatives = false;
      for (const amenity in alternatives) {
        if (alternatives[amenity].length > 0) {
          hasAlternatives = true;
          response += `Instead of ${amenity}, we have spots with ${alternatives[amenity].join(', ')}. `;
        }
      }
      
      if (!hasAlternatives) {
        response += `Would you like to continue your search without ${invalidAmenities.length > 1 ? 'these amenities' : 'this amenity'}? `;
      }
    }
    
    // Check if the query involves comparing options
    if (nlpResponse.intent === 'comparison' && conversation.context.lastRecommendations && conversation.context.lastRecommendations.length > 1) {
      response += "When comparing these camping spots: ";
      
      if (nlpResponse.intent === 'comparison.price') {
        // Sort by price
        const sortedByPrice = [...conversation.context.lastRecommendations].sort((a, b) => a.price - b.price);
        response += `${sortedByPrice[0].title} is the most affordable at $${sortedByPrice[0].price} per night. `;
        
        if (sortedByPrice.length > 1) {
          response += `${sortedByPrice[sortedByPrice.length-1].title} is the premium option at $${sortedByPrice[sortedByPrice.length-1].price} per night.`;
        }
      } 
      else if (nlpResponse.intent === 'comparison.feature' && nlpResponse.entities.features.length > 0) {
        const feature = nlpResponse.entities.features[0];
        response += `For proximity to ${feature}, `;
        
        // This would require additional logic to determine which spot is closer to the feature
        // Simplified example:
        const spots = conversation.context.lastRecommendations;
        response += `${spots[0].title} and ${spots[1].title} both offer good access to ${feature}.`;
      }
      else {
        // General comparison
        response += "They differ in price, amenities, and location. Would you like me to highlight specific differences?";
      }
      
      // Add response to history
      addToConversationHistory(userId, 'bot', response);
      
      return res.json({
        response,
        intent: nlpResponse.intent,
        sentiment: nlpResponse.entities.sentiment
      });
    }
    
    // Generate response based on preferences
    const preferences = conversation.preferences;
    
    // Check if we have enough information to provide recommendations
    const hasMinimumSearchCriteria = 
      (preferences.location) || 
      (preferences.dateRange && preferences.dateRange.startDate) ||
      (preferences.amenities && preferences.amenities.length > 0) ||
      (preferences.nearbyFeatures && preferences.nearbyFeatures.length > 0) ||
      (preferences.priceRange.min !== null || preferences.priceRange.max !== null) ||
      (preferences.guestCount !== null);
    
    if (hasMinimumSearchCriteria) {
      // Build a recommendation response
      response += "Based on what you've told me, ";
      
      if (preferences.location) {
        response += `I can recommend camping spots in ${preferences.location}. `;
      }
      
      if (preferences.nearbyFeatures && preferences.nearbyFeatures.length > 0) {
        response += `I found several camping spots near ${preferences.nearbyFeatures.join(' and ')}. `;
      }
      
      if (preferences.amenities && preferences.amenities.length > 0) {
        response += `They come with amenities like ${preferences.amenities.join(', ')}. `;
      }
      
      if (preferences.dateRange && preferences.dateRange.startDate) {
        response += `They're available from ${preferences.dateRange.startDate} to ${preferences.dateRange.endDate}. `;
      }
      
      if (preferences.priceRange.min !== null || preferences.priceRange.max !== null) {
        if (preferences.priceRange.min !== null && preferences.priceRange.max !== null) {
          response += `These spots are priced between $${preferences.priceRange.min} and $${preferences.priceRange.max} per night. `;
        } else if (preferences.priceRange.max !== null) {
          response += `These spots are under $${preferences.priceRange.max} per night. `;
        } else {
          response += `These spots are above $${preferences.priceRange.min} per night. `;
        }
      }
      
      if (preferences.guestCount) {
        response += `They can accommodate ${preferences.guestCount} or more guests. `;
      }
      
      response += "Would you like to see these options?";
      
      // This is where we would normally query the database for actual recommendations
      // Simulating with a suggestion to hit the recommendations endpoint
      conversation.context.readyForRecommendations = true;
    } else {
      // Not enough info, ask for more details
      response += "I'd like to help you find the perfect camping spot. " +
                 "Could you tell me more about what you're looking for? " +
                 "For example, where you want to go, when you're planning to camp, " +
                 "or what amenities you need.";
    }
    
    // Add response to history
    addToConversationHistory(userId, 'bot', response);
    
    // Send the response
    res.json({ 
      response,
      hasRecommendations: conversation.context.readyForRecommendations,
      intent: nlpResponse.intent,
      sentiment: nlpResponse.entities.sentiment,
      conversationHistory: getConversationHistory(userId, 3) // Return last 3 messages for context
    });
    
  } catch (error) {
    console.error('Error in chatbot message endpoint:', error);
    res.status(500).json({ error: 'An error occurred processing your message' });
  }
});

// Refined Validation Schema for recommendations
const recommendationsSchema = z.object({
  sessionId: z.string().optional(),
  userId: z.string().optional(),
  preferences: z.object({
    location: z.string().optional(),
    dateRange: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional()
    }).optional(),
    amenities: z.array(z.string()).optional(),
    nearbyFeatures: z.array(z.string()).optional(),
    priceRange: z.object({
      min: z.number().optional(),
      max: z.number().optional()
    }).optional(),
    guestCount: z.number().optional()
  }).optional()
});

// New endpoint for getting recommendations
router.post('/recommendations', async (req, res) => {
  try {
    // Validate the request body
    const validatedData = recommendationsSchema.parse(req.body);
    const { sessionId = 'anonymous', userId = sessionId, preferences: explicitPreferences } = validatedData;
    
    // Get the conversation
    const conversation = getConversation(userId);
    
    // Merge explicit preferences with conversation preferences
    const preferences = {
      location: explicitPreferences?.location || conversation.preferences.location,
      dateRange: explicitPreferences?.dateRange || conversation.preferences.dateRange,
      amenities: explicitPreferences?.amenities || conversation.preferences.amenities,
      nearbyFeatures: explicitPreferences?.nearbyFeatures || conversation.preferences.nearbyFeatures,
      priceRange: explicitPreferences?.priceRange || conversation.preferences.priceRange,
      guestCount: explicitPreferences?.guestCount || conversation.preferences.guestCount
    };
    
    // Build database query
    const dbQuery = {
      where: {
        AND: []
      },
      include: {
        location: {
          include: {
            country: true
          }
        },
        camping_spot_amenities: {
          include: {
            amenity: true
          }
        },
        images: true
      },
      take: 5 // Limit to 5 recommendations
    };
    
    // Add filters based on preferences
    if (preferences.location) {
      dbQuery.where.AND.push({
        location: {
          OR: [
            { city: { contains: preferences.location, mode: 'insensitive' } },
            { country: { name: { contains: preferences.location, mode: 'insensitive' } } }
          ]
        }
      });
    }
    
    if (preferences.amenities && preferences.amenities.length > 0) {
      dbQuery.where.AND.push({
        camping_spot_amenities: {
          some: {
            amenity: {
              name: {
                in: preferences.amenities,
                mode: 'insensitive'
              }
            }
          }
        }
      });
    }
    
    if (preferences.priceRange?.min !== null) {
      dbQuery.where.AND.push({ price_per_night: { gte: preferences.priceRange.min } });
    }
    
    if (preferences.priceRange?.max !== null) {
      dbQuery.where.AND.push({ price_per_night: { lte: preferences.priceRange.max } });
    }
    
    if (preferences.guestCount) {
      dbQuery.where.AND.push({ max_guests: { gte: preferences.guestCount } });
    }
    
    // Add rejected recommendations filter
    if (conversation.preferences.rejectedRecommendations && conversation.preferences.rejectedRecommendations.length > 0) {
      dbQuery.where.AND.push({
        camping_spot_id: {
          notIn: conversation.preferences.rejectedRecommendations
        }
      });
    }
    
    // Execute query
    let recommendations = [];
    try {
      recommendations = await prisma.camping_spot.findMany(dbQuery);
      
      // Clean up the results
      const cleanRecommendations = recommendations.map(spot => ({
        id: spot.camping_spot_id,
        title: spot.title,
        description: spot.description,
        price: spot.price_per_night,
        location: {
          city: spot.location.city,
          country: spot.location.country.name
        },
        amenities: spot.camping_spot_amenities.map(rel => rel.amenity.name),
        images: spot.images.map(img => img.image_url),
        maxGuests: spot.max_guests
      }));
      
      // Store recommendations in conversation context
      conversation.context.lastRecommendations = cleanRecommendations;
      
      // Track this search in history
      conversation.preferences.previousSearches.push({
        timestamp: new Date(),
        criteria: {...preferences},
        resultCount: cleanRecommendations.length
      });
      
      // Generate natural language response
      let responseMessage = "";
      
      if (cleanRecommendations.length > 0) {
        responseMessage = `I found ${cleanRecommendations.length} camping spots that match your criteria.`;
      } else {
        responseMessage = "I couldn't find any camping spots exactly matching your criteria. Would you like to broaden your search?";
      }
      
      // Add to history
      addToConversationHistory(userId, 'bot', responseMessage);
      
      return res.json({
        message: responseMessage,
        recommendations: cleanRecommendations,
        searchCriteria: preferences
      });
      
    } catch (error) {
      console.error('Database error getting recommendations:', error);
      return res.status(500).json({
        error: 'Failed to retrieve recommendations',
        message: 'There was an error searching for camping spots. Please try again.'
      });
    }
    
  } catch (error) {
    console.error('Error in recommendations endpoint:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'An error occurred processing your request' });
  }
});

// Get conversation history endpoint
router.get('/conversation-history/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { limit = 10 } = req.query;
    
    const history = getConversationHistory(userId, parseInt(limit));
    
    res.json({
      userId,
      history
    });
  } catch (error) {
    console.error('Error fetching conversation history:', error);
    res.status(500).json({ error: 'Failed to retrieve conversation history' });
  }
});

// Get chatbot suggestions endpoint
router.get('/suggestions', (req, res) => {
  // Allow CORS for this specific route
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  const suggestions = [
    "Find me a camping spot near a lake",
    "I need a spot for 4 people with WiFi",
    "Looking for a camping spot under $50 per night in Belgium",
    "Are there any spots with campfire allowed?",
    "Show me spots with hiking trails nearby",
    "Pet-friendly camping spots in the mountains",
    "What's your cancellation policy?",
    "Find a camping spot near a beach for this summer"
  ];
  
  res.json({ suggestions });
});

module.exports = router;
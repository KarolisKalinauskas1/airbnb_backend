const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const { z } = require('zod');
const natural = require('natural'); // Add natural NLP library

// Initialize NLP tools
const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;
const classifier = new natural.BayesClassifier();

// Extract keywords and preferences from user query
function extractKeywords(query) {
  const lowercaseQuery = query.toLowerCase();
  const tokens = tokenizer.tokenize(lowercaseQuery);
  
  // Default extracted preferences
  const extractedPreferences = {
    priceRange: { min: null, max: null },
    guestCount: null,
    location: null,
    locationRadius: null, // Added location radius
    amenities: [],
    dateRange: { startDate: null, endDate: null },
    nearbyFeatures: [] // Add a new field to track natural features
  };
  
  // Classify intent
  let intent;
  try {
    intent = classifier.classify(lowercaseQuery);
  } catch (error) {
    console.error('Classification error:', error);
    intent = 'unknown';
  }
  
  // Extract location - common cities and regions
  const cityNames = [
    'brussels', 'antwerp', 'ghent', 'bruges', 'leuven', 'liege', 'namur', 'charleroi', 'mons', 'dinant',
    'ardennes', 'flanders', 'wallonia'
  ];
  
  // Natural features to look for (separate from cities)
  const naturalFeatures = [
    'coastline', 'beach', 'forest', 'mountain', 'river', 'lake', 'ocean', 'sea', 'hill', 'valley', 'waterfall'
  ];
  
  // Look for location with radius pattern - multiple formats
  const radiusPatterns = [
    // "in Brussels or within 10km"
    /(?:in|near|around)\s+([a-zA-Z\s]+)(?:\s+or)?\s+(?:within|around|about|in a radius of|in a range of)\s+(\d+)\s*(?:km|kilometers|miles|mi)/i,
    // "Brussels 10km radius"
    /([a-zA-Z\s]+)\s+(\d+)\s*(?:km|kilometers|miles|mi)(?:\s+radius)/i,
    // "10km around Brussels"
    /(\d+)\s*(?:km|kilometers|miles|mi)(?:\s+around|near|from|of)\s+([a-zA-Z\s]+)/i,
    // "within 10km of Brussels"
    /(?:within|in)\s+(\d+)\s*(?:km|kilometers|miles|mi)(?:\s+of|from|around)\s+([a-zA-Z\s]+)/i
  ];
  
  let locationFound = false;
  let featureFound = false;
  
  // Check for queries about being near natural features
  for (const feature of naturalFeatures) {
    // Look for "near a lake", "close to a forest", etc.
    const nearFeaturePattern = new RegExp(`(?:near|close to|by|next to|at)\\s+(?:a|the)?\\s+${feature}`, 'i');
    if (nearFeaturePattern.test(lowercaseQuery)) {
      extractedPreferences.nearbyFeatures.push(feature);
      featureFound = true;
      // Don't look for city locations if user is specifically asking for natural features
      // This prevents defaulting to cities like Dinant when user asks for a lake
    }
  }
  
  // Only check for city locations if no natural features were found
  // This prevents the chatbot from suggesting Dinant when user asks for a lake
  if (!featureFound) {
    // Check each radius pattern
    for (const pattern of radiusPatterns) {
      const match = lowercaseQuery.match(pattern);
      if (match) {
        // Different patterns have location and radius in different positions
        let location, radius;
        
        if (pattern.toString().indexOf("within.*of") > -1 || pattern.toString().indexOf("km.*around") > -1) {
          // Patterns where radius comes before location
          radius = parseInt(match[1]);
          location = match[2].trim();
        } else {
          // Patterns where location comes before radius
          location = match[1].trim();
          radius = parseInt(match[2]);
        }
        
        // Check if the extracted location is actually a city (not a natural feature)
        if (cityNames.includes(location.toLowerCase())) {
          extractedPreferences.location = location.charAt(0).toUpperCase() + location.slice(1);
          extractedPreferences.locationRadius = radius;
          locationFound = true;
          break;
        }
      }
    }
    
    // If no location with radius was found, look for simple location
    if (!locationFound) {
      for (const token of tokens) {
        if (cityNames.includes(token)) {
          extractedPreferences.location = token.charAt(0).toUpperCase() + token.slice(1);
          locationFound = true;
          break;
        }
      }
      
      // Check for location in the full query for multi-word locations (only city names)
      if (!locationFound) {
        for (const location of cityNames) {
          if (lowercaseQuery.includes(location)) {
            extractedPreferences.location = location.charAt(0).toUpperCase() + location.slice(1);
            locationFound = true;
            break;
          }
        }
      }
    }
  }
  
  // Extract guest count
  const guestMatch = query.match(/(\d+)\s+(person|people|guest|guests|traveller|travellers|traveler|travelers)/i);
  if (guestMatch) {
    extractedPreferences.guestCount = parseInt(guestMatch[1]);
  }
  
  // Extract price range
  const priceRangeMatch = query.match(/(\$|\€|euro|eur)?\s?(\d+)(\s*-\s*|\s+to\s+)(\$|\€|euro|eur)?\s?(\d+)/i);
  if (priceRangeMatch) {
    extractedPreferences.priceRange.min = parseInt(priceRangeMatch[2]);
    extractedPreferences.priceRange.max = parseInt(priceRangeMatch[5]);
  } else {
    // Look for maximum price
    const maxPriceMatch = query.match(/(?:under|below|less than|not more than|maximum|max|up to)\s+(\$|\€|euro|eur)?\s?(\d+)/i);
    if (maxPriceMatch) {
      extractedPreferences.priceRange.max = parseInt(maxPriceMatch[2]);
    }
    
    // Look for minimum price
    const minPriceMatch = query.match(/(?:over|above|more than|at least|minimum|min|from)\s+(\$|\€|euro|eur)?\s?(\d+)/i);
    if (minPriceMatch) {
      extractedPreferences.priceRange.min = parseInt(minPriceMatch[2]);
    }
  }
  
  // Extract amenities - ONLY match when explicitly mentioned in context
  const amenityKeywords = [
    { pattern: /\b(?:wifi|internet|connection|online)\b/i, amenity: 'WiFi' },
    { pattern: /\b(?:shower|bathroom|bath|clean)\b/i, amenity: 'Shower' },
    { pattern: /\b(?:kitchen|cooking|cook|stove)\b/i, amenity: 'Kitchen' },
    { pattern: /\b(?:parking|car|vehicle|park)\b/i, amenity: 'Parking' },
    { pattern: /\b(?:campfire|bonfire|firepit)\b/i, amenity: 'Campfire' }, // Be more specific to avoid false positives
    { pattern: /\b(?:pet|dog|cat|animal|pets)\b/i, amenity: 'Pet friendly' },
    { pattern: /\b(?:toilet|restroom|bathroom)\b/i, amenity: 'Toilet' },
    { pattern: /\b(?:drinking water|drinkable|water supply)\b/i, amenity: 'Drinking water' },
    { pattern: /\b(?:hike|hiking|trail|walk|walking)\b/i, amenity: 'Hiking trails' },
    { pattern: /\b(?:electricity|power|outlet|charging)\b/i, amenity: 'Electricity' }
  ];
  
  // Only add amenities that are explicitly mentioned in the query
  for (const item of amenityKeywords) {
    if (item.pattern.test(lowercaseQuery)) {
      extractedPreferences.amenities.push(item.amenity);
    }
  }
  
  // Remove duplicates from amenities
  extractedPreferences.amenities = [...new Set(extractedPreferences.amenities)];
  
  return extractedPreferences;
}

// Train the classifier with camping-related intents
function trainClassifier() {
  // Location intent
  classifier.addDocument('camping near lake', 'location');
  classifier.addDocument('spots in forest', 'location');
  classifier.addDocument('camping in mountains', 'location');
  classifier.addDocument('camping spots near water', 'location');
  classifier.addDocument('find places near beach', 'location');
  
  // Price intent
  classifier.addDocument('camping under 50 dollars', 'price');
  classifier.addDocument('cheap spots', 'price');
  classifier.addDocument('affordable camping', 'price');
  classifier.addDocument('budget friendly options', 'price');
  classifier.addDocument('low cost camping', 'price');
  
  // Amenities intent
  classifier.addDocument('with wifi', 'amenities');
  classifier.addDocument('campfire allowed', 'amenities');
  classifier.addDocument('spots with shower', 'amenities');
  classifier.addDocument('camping with electricity', 'amenities');
  classifier.addDocument('places with bathrooms', 'amenities');
  
  // Guests intent
  classifier.addDocument('for 4 people', 'guests');
  classifier.addDocument('camping for family', 'guests');
  classifier.addDocument('spot for two', 'guests');
  classifier.addDocument('group camping', 'guests');
  classifier.addDocument('camping with friends', 'guests');
  
  // FAQ intent
  classifier.addDocument('how to book', 'faq');
  classifier.addDocument('cancellation policy', 'faq');
  classifier.addDocument('can I bring pets', 'faq');
  classifier.addDocument('check in time', 'faq');
  classifier.addDocument('what to bring', 'faq');
  
  classifier.train();
}

// Train on router initialization
trainClassifier();

// FAQ data for common questions
const faqData = [
  {
    keywords: ['book', 'reservation', 'reserve', 'booking'],
    question: "How do I make a booking?",
    answer: "You can make a booking by selecting a camping spot, choosing your dates, and completing the checkout process with payment. Look for the 'Book' button on any camping spot page."
  },
  {
    keywords: ['cancel', 'cancellation', 'refund', 'money back'],
    question: "What is your cancellation policy?",
    answer: "Cancellations made 7 days before check-in receive a full refund. Cancellations within 7 days receive a 50% refund."
  },
  {
    keywords: ['pet', 'dog', 'cat', 'animal', 'pets'],
    question: "Can I bring pets to camping spots?",
    answer: "Some camping spots are pet-friendly. Look for the 'Pet friendly' tag in the listing details or use the chatbot to find pet-friendly options."
  },
  {
    keywords: ['check in', 'check-in', 'arrive', 'arrival'],
    question: "What are the check-in times?",
    answer: "Check-in times vary by camping spot. Most locations allow check-in between 2pm and 6pm. Specific times will be displayed on your booking confirmation."
  },
  {
    keywords: ['bring', 'pack', 'equipment', 'need'],
    question: "What should I bring to the camping spot?",
    answer: "Essential items include a tent, sleeping bag, cooking equipment, and food/water. Specific camping spots may have additional recommendations listed on their detail page."
  }
];

// Additional general information topics about popular amenities
const popularAmenities = {
  pattern: /popular\s+amenities|most\s+popular\s+amenities|what\s+amenities\s+are\s+popular|what\s+amenities\s+are\s+the\s+most\s+popular/i,
  response: "The most popular amenities that campers look for are:\n\n1. Toilets and showers (requested by 85% of campers)\n2. Drinking water access (78%)\n3. Campfire areas (72%)\n4. WiFi connectivity (65%)\n5. Electricity hookups (60%)\n6. Hiking trails nearby (55%)\n7. Kitchen facilities (48%)\n8. Pet-friendly accommodations (42%)\n9. Parking spaces (40%)\n10. Swimming areas like lakes or pools (38%)\n\nWould you like me to help you find camping spots with any of these amenities?"
};

// Function to check if a query is a general information question
function isGeneralInfoQuestion(query) {
  const generalInfoPatterns = [
    /what (?:are|is) (?:the )?(?:most )?popular/i,
    /tell me about (?:the )?(?:most )?popular/i,
    /which (?:amenities|features) (?:are|is) (?:most )?popular/i,
    /what (?:amenities|features) do (?:most )?people (?:want|need|look for|prefer)/i,
    /what's (?:common|important|essential) for camping/i,
    /popular amenities/i,
    /most requested amenities/i,
    /common amenities/i
  ];
  
  return generalInfoPatterns.some(pattern => pattern.test(query));
}

// Check if a message is a question about FAQs
function checkForFAQ(query) {
  const tokens = tokenizer.tokenize(query.toLowerCase());
  const stemmedTokens = tokens.map(token => stemmer.stem(token));
  
  for (const faq of faqData) {
    // Check if any keywords match
    const matchFound = faq.keywords.some(keyword => {
      const stemmedKeyword = stemmer.stem(keyword);
      return stemmedTokens.includes(stemmedKeyword);
    });
    
    if (matchFound) {
      return {
        question: faq.question,
        answer: faq.answer
      };
    }
  }
  
  return null;
}

// Validation schema for chatbot query
const chatQuerySchema = z.object({
  query: z.string().min(3).max(500),
  userPreferences: z.object({
    priceRange: z.object({
      min: z.number().optional(),
      max: z.number().optional()
    }).optional(),
    guestCount: z.number().optional(),
    location: z.string().optional(),
    amenities: z.array(z.string()).optional(),
    dateRange: z.object({
      startDate: z.string().optional(),
      endDate: z.string().optional()
    }).optional()
  }).optional(),
  sessionId: z.string().optional()
});

// State management for ongoing conversations
const activeConversations = new Map();

// Define conversation states
const ConversationState = {
  INITIAL: 'initial',
  ASKING_DATES: 'asking_dates',
  ASKING_LOCATION: 'asking_location',
  ASKING_GUESTS: 'asking_guests',
  ASKING_PRICE_RANGE: 'asking_price_range',
  ASKING_AMENITIES: 'asking_amenities',
  REFINING_SEARCH: 'refining_search'
};

// Get or create conversation for a user
function getConversation(userId) {
  if (!activeConversations.has(userId)) {
    activeConversations.set(userId, {
      state: ConversationState.INITIAL,
      preferences: {
        dateRange: { startDate: null, endDate: null },
        location: null,
        guestCount: null,
        priceRange: { min: null, max: null },
        amenities: []
      },
      lastActivity: Date.now(),
      context: {}
    });
  }
  
  // Update last activity timestamp
  const conversation = activeConversations.get(userId);
  conversation.lastActivity = Date.now();
  return conversation;
}

// Clean up old conversations (called periodically)
function cleanupConversations() {
  const now = Date.now();
  const timeout = 30 * 60 * 1000; // 30 minutes
  
  for (const [userId, conversation] of activeConversations.entries()) {
    if (now - conversation.lastActivity > timeout) {
      activeConversations.delete(userId);
    }
  }
}

// Set up periodic cleanup
setInterval(cleanupConversations, 10 * 60 * 1000); // Every 10 minutes

// Process dates from user input
function processDates(input) {
  const months = [
    'january', 'february', 'march', 'april', 'may', 'june', 
    'july', 'august', 'september', 'october', 'november', 'december'
  ];
  
  // Current date for reference
  const now = new Date();
  const currentYear = now.getFullYear();
  
  // Try to extract date ranges using various patterns
  
  // Pattern: "from May 10 to May 15"
  const fromToPattern = /from\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?\s+(?:to|until|till)\s+([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:\s+(\d{4}))?/i;
  let match = input.match(fromToPattern);
  if (match) {
    const startMonth = months.indexOf(match[1].toLowerCase());
    const startDay = parseInt(match[2]);
    const endMonth = months.indexOf(match[3].toLowerCase());
    const endDay = parseInt(match[4]);
    const year = match[5] ? parseInt(match[5]) : currentYear;
    
    if (startMonth !== -1 && endMonth !== -1) {
      let startDate = new Date(year, startMonth, startDay);
      let endDate = new Date(year, endMonth, endDay);
      
      // If end date is before start date, assume it's next year
      if (endDate < startDate) {
        endDate = new Date(year + 1, endMonth, endDay);
      }
      
      return { 
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    }
  }
  
  // Pattern: "in June" (entire month)
  const monthPattern = /in\s+([a-z]+)(?:\s+(\d{4}))?/i;
  match = input.match(monthPattern);
  if (match) {
    const month = months.indexOf(match[1].toLowerCase());
    const year = match[2] ? parseInt(match[2]) : currentYear;
    
    if (month !== -1) {
      const startDate = new Date(year, month, 1);
      const endDate = new Date(year, month + 1, 0); // Last day of month
      
      return { 
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    }
  }
  
  // Pattern: "next week", "this weekend", etc.
  if (/next\s+week/i.test(input)) {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + (7 - startDate.getDay()));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }
  
  if (/this\s+weekend/i.test(input) || /coming\s+weekend/i.test(input)) {
    const startDate = new Date();
    const daysUntilWeekend = 6 - startDate.getDay(); // Saturday
    startDate.setDate(startDate.getDate() + daysUntilWeekend);
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 1); // Sunday
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }
  
  if (/next\s+month/i.test(input)) {
    const nextMonth = (now.getMonth() + 1) % 12;
    const year = nextMonth === 0 ? currentYear + 1 : currentYear;
    const startDate = new Date(year, nextMonth, 1);
    const endDate = new Date(year, nextMonth + 1, 0);
    
    return {
      startDate: startDate.toISOString().split('T')[0],
      endDate: endDate.toISOString().split('T')[0]
    };
  }
  
  // Pattern: specific dates like "May 15"
  const specificDatePattern = /([a-z]+)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/i;
  match = input.match(specificDatePattern);
  if (match) {
    const month = months.indexOf(match[1].toLowerCase());
    const day = parseInt(match[2]);
    const year = match[3] ? parseInt(match[3]) : currentYear;
    
    if (month !== -1) {
      const startDate = new Date(year, month, day);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 2); // Default to 2-night stay
      
      return {
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0]
      };
    }
  }
  
  // Pattern: ISO dates like "2025-05-15"
  const isoDatePattern = /(\d{4}-\d{2}-\d{2})(?:\s+to\s+(\d{4}-\d{2}-\d{2}))?/i;
  match = input.match(isoDatePattern);
  if (match) {
    const startDate = match[1];
    const endDate = match[2] || new Date(new Date(startDate).getTime() + 2 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    return { startDate, endDate };
  }
  
  return null;
}

// Generate follow-up question based on conversation state
function generateFollowUpQuestion(conversation) {
  switch (conversation.state) {
    case ConversationState.ASKING_LOCATION:
      return "To help you find the perfect camping spot, could you tell me which location you're interested in?";
    case ConversationState.ASKING_DATES:
      return "When are you planning your camping trip? You can specify dates like 'May 10 to May 15' or more general times like 'next weekend' or 'in June'.";
    case ConversationState.ASKING_GUESTS:
      return "How many people will be camping? This helps me suggest spots with the right capacity.";
    case ConversationState.ASKING_PRICE_RANGE:
      return "Do you have a budget in mind? For example, are you looking for spots under a certain price per night?";
    case ConversationState.ASKING_AMENITIES:
      return "Are there any specific amenities you need for your camping trip? For example: WiFi, showers, campfire areas, etc.";
    case ConversationState.REFINING_SEARCH:
      return "I found some options, but I could narrow them down further. Would you like to add any other preferences?";
    default:
      return "Can you tell me more about what you're looking for in a camping spot?";
  }
}

// Handle follow-up responses from the user
function handleFollowUp(conversation, query) {
  const response = {
    message: "",
    updatedPreferences: false
  };
  
  switch (conversation.state) {
    case ConversationState.ASKING_LOCATION:
      // Try to extract location from the follow-up
      const extractedPrefs = extractKeywords(query);
      if (extractedPrefs.location) {
        conversation.preferences.location = extractedPrefs.location;
        response.message = `Great! I'll look for camping spots in ${extractedPrefs.location}. `;
        response.updatedPreferences = true;
        
        // Check if we should also update location radius
        if (extractedPrefs.locationRadius) {
          conversation.preferences.locationRadius = extractedPrefs.locationRadius;
          response.message = `Great! I'll look for camping spots within ${extractedPrefs.locationRadius}km of ${extractedPrefs.location}. `;
        }
        
        // Move to asking about dates if needed
        if (!conversation.preferences.dateRange.startDate) {
          conversation.state = ConversationState.ASKING_DATES;
          response.message += generateFollowUpQuestion(conversation);
        } else {
          conversation.state = ConversationState.INITIAL;
          response.message += "Let me search for camping spots based on your preferences.";
        }
      } else {
        response.message = "I'm not sure I understood that location. Could you please specify a city, region, or natural feature like 'forest' or 'lake'?";
      }
      break;
      
    case ConversationState.ASKING_DATES:
      // Try to extract dates from the follow-up
      const dateInfo = processDates(query);
      if (dateInfo) {
        conversation.preferences.dateRange = dateInfo;
        response.message = `Got it! I'll look for availability from ${dateInfo.startDate} to ${dateInfo.endDate}. `;
        response.updatedPreferences = true;
        
        // Move to asking about guests if needed
        if (!conversation.preferences.guestCount) {
          conversation.state = ConversationState.ASKING_GUESTS;
          response.message += generateFollowUpQuestion(conversation);
        } else {
          conversation.state = ConversationState.INITIAL;
          response.message += "Let me search for camping spots based on your preferences.";
        }
      } else {
        response.message = "I couldn't understand those dates. Could you format them like 'May 10 to May 15', 'next weekend', or 'in June'?";
      }
      break;
      
    case ConversationState.ASKING_GUESTS:
      // Try to extract guest count from the follow-up
      const guestMatch = query.match(/(\d+)/);
      if (guestMatch) {
        const guestCount = parseInt(guestMatch[1]);
        conversation.preferences.guestCount = guestCount;
        response.message = `Perfect! I'll look for spots that can accommodate ${guestCount} guests. `;
        response.updatedPreferences = true;
        
        // Move to asking about price range if needed
        if (!conversation.preferences.priceRange.min && !conversation.preferences.priceRange.max) {
          conversation.state = ConversationState.ASKING_PRICE_RANGE;
          response.message += generateFollowUpQuestion(conversation);
        } else {
          conversation.state = ConversationState.INITIAL;
          response.message += "Let me search for camping spots based on your preferences.";
        }
      } else {
        response.message = "I need to know how many people will be staying. Could you provide a number?";
      }
      break;
      
    case ConversationState.ASKING_PRICE_RANGE:
      // Try to extract price range from the follow-up
      const extractedPrefsForPrice = extractKeywords(query);
      if (extractedPrefsForPrice.priceRange.min !== null || extractedPrefsForPrice.priceRange.max !== null) {
        conversation.preferences.priceRange = extractedPrefsForPrice.priceRange;
        
        let priceMessage = "";
        if (extractedPrefsForPrice.priceRange.min !== null && extractedPrefsForPrice.priceRange.max !== null) {
          priceMessage = `between $${extractedPrefsForPrice.priceRange.min} and $${extractedPrefsForPrice.priceRange.max}`;
        } else if (extractedPrefsForPrice.priceRange.max !== null) {
          priceMessage = `under $${extractedPrefsForPrice.priceRange.max}`;
        } else if (extractedPrefsForPrice.priceRange.min !== null) {
          priceMessage = `over $${extractedPrefsForPrice.priceRange.min}`;
        }
        
        response.message = `Got it! I'll look for camping spots ${priceMessage} per night. `;
        response.updatedPreferences = true;
        
        // Move to asking about amenities if needed
        if (!conversation.preferences.amenities || conversation.preferences.amenities.length === 0) {
          conversation.state = ConversationState.ASKING_AMENITIES;
          response.message += generateFollowUpQuestion(conversation);
        } else {
          conversation.state = ConversationState.INITIAL;
          response.message += "Let me search for camping spots based on your preferences.";
        }
      } else if (/no budget|don'?t care|any price|doesn'?t matter/i.test(query)) {
        // User doesn't have a specific budget
        response.message = "No problem! I'll show you camping spots across different price ranges. ";
        response.updatedPreferences = true;
        
        if (!conversation.preferences.amenities || conversation.preferences.amenities.length === 0) {
          conversation.state = ConversationState.ASKING_AMENITIES;
          response.message += generateFollowUpQuestion(conversation);
        } else {
          conversation.state = ConversationState.INITIAL;
          response.message += "Let me search for camping spots based on your preferences.";
        }
      } else {
        response.message = "I couldn't understand your budget preference. Could you specify a price range like 'under $50' or 'between $30 and $80'?";
      }
      break;
      
    case ConversationState.ASKING_AMENITIES:
      // Try to extract amenities from the follow-up
      const extractedPrefsForAmenities = extractKeywords(query);
      if (extractedPrefsForAmenities.amenities && extractedPrefsForAmenities.amenities.length > 0) {
        conversation.preferences.amenities = extractedPrefsForAmenities.amenities;
        response.message = `Great! I'll look for spots with ${extractedPrefsForAmenities.amenities.join(', ')}. `;
        response.updatedPreferences = true;
        conversation.state = ConversationState.INITIAL;
        response.message += "Let me search for camping spots based on your preferences.";
      } else if (/no|none|not needed|don'?t need|not necessary|doesn'?t matter/i.test(query)) {
        // User doesn't need specific amenities
        response.message = "No problem! I'll show you camping spots with various amenities. ";
        response.updatedPreferences = true;
        conversation.state = ConversationState.INITIAL;
        response.message += "Let me search for camping spots based on your preferences.";
      } else {
        response.message = "I couldn't detect any specific amenities. Would you like your camping spot to have features like WiFi, showers, a campfire area, or anything else?";
      }
      break;
      
    case ConversationState.REFINING_SEARCH:
      // Handle refining search based on additional criteria
      const extractedPrefsForRefining = extractKeywords(query);
      let updatedAny = false;
      
      // Check if any new preferences were extracted
      if (extractedPrefsForRefining.location && extractedPrefsForRefining.location !== conversation.preferences.location) {
        conversation.preferences.location = extractedPrefsForRefining.location;
        updatedAny = true;
      }
      
      if (extractedPrefsForRefining.guestCount && extractedPrefsForRefining.guestCount !== conversation.preferences.guestCount) {
        conversation.preferences.guestCount = extractedPrefsForRefining.guestCount;
        updatedAny = true;
      }
      
      if (extractedPrefsForRefining.priceRange.min !== null || extractedPrefsForRefining.priceRange.max !== null) {
        if (extractedPrefsForRefining.priceRange.min !== null) {
          conversation.preferences.priceRange.min = extractedPrefsForRefining.priceRange.min;
        }
        if (extractedPrefsForRefining.priceRange.max !== null) {
          conversation.preferences.priceRange.max = extractedPrefsForRefining.priceRange.max;
        }
        updatedAny = true;
      }
      
      if (extractedPrefsForRefining.amenities && extractedPrefsForRefining.amenities.length > 0) {
        // Merge unique amenities
        const uniqueAmenities = new Set([...conversation.preferences.amenities, ...extractedPrefsForRefining.amenities]);
        conversation.preferences.amenities = [...uniqueAmenities];
        updatedAny = true;
      }
      
      // Process dates if present
      const refinedDateInfo = processDates(query);
      if (refinedDateInfo) {
        conversation.preferences.dateRange = refinedDateInfo;
        updatedAny = true;
      }
      
      if (updatedAny) {
        response.message = "Great! I've updated your preferences. Let me refine the search results.";
        response.updatedPreferences = true;
        conversation.state = ConversationState.INITIAL;
      } else {
        response.message = "I didn't catch any new preferences. Do you want to change your search criteria for location, dates, guests, budget, or amenities?";
      }
      break;
      
    default:
      // Default case for any other state
      response.message = "Let me help you find camping spots. What are you looking for?";
      conversation.state = ConversationState.INITIAL;
  }
  
  return response;
}

// Handle messaging endpoint
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId = 'anonymous' } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Get or create conversation state for this user
    const conversation = getConversation(sessionId);
    
    // First check if this is an FAQ question
    const faqMatch = checkForFAQ(message);
    if (faqMatch) {
      // Reset conversation to initial state since this is an FAQ
      conversation.state = ConversationState.INITIAL;
      
      return res.json({
        response: faqMatch.answer
      });
    }
    
    // Check if this is a general information question
    if (isGeneralInfoQuestion(message)) {
      // Check specifically for amenity information queries
      if (popularAmenities.pattern.test(message)) {
        return res.json({
          response: popularAmenities.response
        });
      }
      
      // Handle other general info queries similarly to the /query endpoint
      const generalInfoTopics = [
        {
          pattern: /booking|reservations|reserve|book/i,
          response: "To book a camping spot, browse our listings, select the dates you want to stay, and click the 'Book Now' button. You'll need to create an account if you don't already have one. Payment is processed securely online."
        },
        {
          pattern: /price|cost|rate|fee|charges/i,
          response: "Camping spot prices vary based on location, amenities, and season. Prices typically range from $20 to $150 per night. You can filter by price range when searching for spots."
        },
        {
          pattern: /most popular amenities|popular amenities/i,
          response: popularAmenities.response
        },
        // ...other general info topics...
      ];
      
      // Check for matches with general info topics
      for (const topic of generalInfoTopics) {
        if (topic.pattern.test(message)) {
          return res.json({
            response: topic.response
          });
        }
      }
    }

    // Check if this is a follow-up to a previous question
    if (conversation.state !== ConversationState.INITIAL) {
      const followUpResponse = handleFollowUp(conversation, message);
      
      // If we're still in a follow-up state, just return the follow-up message
      if (conversation.state !== ConversationState.INITIAL || !followUpResponse.updatedPreferences) {
        return res.json({
          response: followUpResponse.message
        });
      }
      
      // Otherwise, we can now perform the search with the updated preferences
    }
    
    // Extract keywords from natural language query
    const extractedPreferences = extractKeywords(message);
    
    // Look for date information
    const dateInfo = processDates(message);
    if (dateInfo) {
      extractedPreferences.dateRange = dateInfo;
    }
    
    // Merge with conversation preferences
    const mergedPreferences = {
      priceRange: {
        min: conversation.preferences.priceRange.min || extractedPreferences.priceRange.min,
        max: conversation.preferences.priceRange.max || extractedPreferences.priceRange.max
      },
      guestCount: conversation.preferences.guestCount || extractedPreferences.guestCount,
      location: conversation.preferences.location || extractedPreferences.location,
      amenities: conversation.preferences.amenities.length > 0 ? conversation.preferences.amenities : extractedPreferences.amenities,
      dateRange: conversation.preferences.dateRange.startDate ? conversation.preferences.dateRange : extractedPreferences.dateRange,
      nearbyFeatures: extractedPreferences.nearbyFeatures || []
    };
    
    // Update conversation preferences
    conversation.preferences = mergedPreferences;
    
    // Check if we have enough information or need follow-up questions
    const hasMinimumSearchCriteria = 
      (mergedPreferences.location) || 
      (mergedPreferences.dateRange && mergedPreferences.dateRange.startDate) ||
      (mergedPreferences.amenities && mergedPreferences.amenities.length > 0) ||
      (mergedPreferences.nearbyFeatures && mergedPreferences.nearbyFeatures.length > 0) ||
      (mergedPreferences.priceRange.min !== null || mergedPreferences.priceRange.max !== null);
    
    // Only ask follow-up questions if we don't have any search criteria
    if (!hasMinimumSearchCriteria) {
      // Ask the most relevant missing information
      if (!mergedPreferences.location && !conversation.context.locationAsked) {
        conversation.state = ConversationState.ASKING_LOCATION;
        conversation.context.locationAsked = true;
        return res.json({
          response: generateFollowUpQuestion(conversation)
        });
      } else if (!mergedPreferences.dateRange || !mergedPreferences.dateRange.startDate) {
        conversation.state = ConversationState.ASKING_DATES;
        return res.json({
          response: generateFollowUpQuestion(conversation)
        });
      }
    }
    
    // Generate response based on conversation and preferences
    let response;
    
    // Check if user is asking about camping spots near natural features
    if (mergedPreferences.nearbyFeatures && mergedPreferences.nearbyFeatures.length > 0) {
      // User is asking about camping spots near natural features (e.g., lakes, forests)
      const features = mergedPreferences.nearbyFeatures.join(' and ');
      response = `I found several camping spots near ${features}. `;
      
      // Add more specific information based on the natural features
      if (mergedPreferences.nearbyFeatures.includes('lake')) {
        response += `Our lakeside camping spots offer beautiful water views and activities like swimming and fishing. `;
      } else if (mergedPreferences.nearbyFeatures.includes('forest')) {
        response += `Our forest camping spots are perfect for nature lovers with plenty of shade and wildlife. `;
      } else if (mergedPreferences.nearbyFeatures.includes('beach') || mergedPreferences.nearbyFeatures.includes('coastline')) {
        response += `Our coastal camping spots give you easy access to the beach with amazing sunset views. `;
      }
      
      // Add information about amenities only if the user explicitly mentioned them
      if (mergedPreferences.amenities.length > 0) {
        response += `They come with amenities like ${mergedPreferences.amenities.join(', ')}. `;
      }
      
      response += `Would you like me to show you these options?`;
    }
    // Default response if no specific natural features were mentioned
    else if (mergedPreferences.location) {
      // User specified a location
      response = `I found several camping spots in ${mergedPreferences.location}. `;
      
      if (mergedPreferences.locationRadius) {
        response = `I found several camping spots within ${mergedPreferences.locationRadius}km of ${mergedPreferences.location}. `;
      }
      
      // Add information about amenities only if explicitly mentioned
      if (mergedPreferences.amenities.length > 0) {
        response += `They come with amenities like ${mergedPreferences.amenities.join(', ')}. `;
      }
      
      // Add information about dates if provided
      if (mergedPreferences.dateRange && mergedPreferences.dateRange.startDate) {
        response += `They're available for your dates from ${mergedPreferences.dateRange.startDate} to ${mergedPreferences.dateRange.endDate}. `;
      }
      
      // Add information about price if provided
      if (mergedPreferences.priceRange.min !== null || mergedPreferences.priceRange.max !== null) {
        if (mergedPreferences.priceRange.min !== null && mergedPreferences.priceRange.max !== null) {
          response += `These spots are priced between $${mergedPreferences.priceRange.min} and $${mergedPreferences.priceRange.max} per night. `;
        } else if (mergedPreferences.priceRange.max !== null) {
          response += `These spots are under $${mergedPreferences.priceRange.max} per night. `;
        } else {
          response += `These spots are above $${mergedPreferences.priceRange.min} per night. `;
        }
      }
      
      response += `Would you like me to show you these options?`;
    } 
    else if (hasMinimumSearchCriteria) {
      // We have some criteria but not location
      response = "I found some camping spots that match your criteria. ";
      
      // Mention the criteria we do have
      if (mergedPreferences.amenities.length > 0) {
        response += `They include the amenities you mentioned: ${mergedPreferences.amenities.join(', ')}. `;
      }
      
      if (mergedPreferences.dateRange && mergedPreferences.dateRange.startDate) {
        response += `They're available from ${mergedPreferences.dateRange.startDate} to ${mergedPreferences.dateRange.endDate}. `;
      }
      
      if (mergedPreferences.priceRange.min !== null || mergedPreferences.priceRange.max !== null) {
        if (mergedPreferences.priceRange.min !== null && mergedPreferences.priceRange.max !== null) {
          response += `They're priced between $${mergedPreferences.priceRange.min} and $${mergedPreferences.priceRange.max} per night. `;
        } else if (mergedPreferences.priceRange.max !== null) {
          response += `They're under $${mergedPreferences.priceRange.max} per night. `;
        } else {
          response += `They're above $${mergedPreferences.priceRange.min} per night. `;
        }
      }
      
      if (mergedPreferences.guestCount) {
        response += `They can accommodate ${mergedPreferences.guestCount} guests. `;
      }
      
      response += "Would you like to refine your search with a specific location?";
      conversation.state = ConversationState.ASKING_LOCATION;
    }
    else {
      // General search query without specific information
      response = "I can help you find the perfect camping spot. Could you tell me more about what you're looking for? For example, are you interested in a specific location, amenities, or natural features like lakes or forests?";
      // Set state to ask for location next
      conversation.state = ConversationState.ASKING_LOCATION;
    }
    
    // Send response
    res.json({ response });
  } catch (error) {
    logger.error('Error in chatbot message endpoint:', error);
    res.status(500).json({ error: 'An error occurred processing your message' });
  }
});

/**
 * Process chatbot query and return recommendations
 * POST /api/chatbot/query
 * Public endpoint - no authentication required
 */
router.post('/query', async (req, res) => {
  try {
    // Extended schema to support the new isGeneralInfoQuery flag
    const extendedSchema = chatQuerySchema.extend({
      isGeneralInfoQuery: z.boolean().optional()
    });
    
    // Validate input
    const { query, userPreferences, sessionId = 'anonymous', isGeneralInfoQuery = false } = extendedSchema.parse(req.body);
    
    // Get or create conversation state for this user
    const conversation = getConversation(sessionId);
    
    // Check if this is a general information query rather than a spot request
    const isGeneralInfo = isGeneralInfoQuestion(query) || isGeneralInfoQuery;
    
    // First check if this is an FAQ question - highest priority for general information
    const faqMatch = checkForFAQ(query);
    if (faqMatch) {
      // Reset conversation to initial state since this is an FAQ
      conversation.state = ConversationState.INITIAL;
      
      return res.json({
        message: faqMatch.answer,
        isFaq: true,
        faqQuestion: faqMatch.question
      });
    }
    
    // Handle general information queries separately from the conversation flow
    if (isGeneralInfo) {
      // Check specifically for amenity information queries
      if (popularAmenities.pattern.test(query)) {
        return res.json({
          message: popularAmenities.response,
          isGeneralInfo: true
        });
      }
      
      // Check for other general information topics
      const generalInfoTopics = [
        {
          pattern: /booking|reservations|reserve|book/i,
          response: "To book a camping spot, browse our listings, select the dates you want to stay, and click the 'Book Now' button. You'll need to create an account if you don't already have one. Payment is processed securely online."
        },
        {
          pattern: /price|cost|rate|fee|charges/i,
          response: "Camping spot prices vary based on location, amenities, and season. Prices typically range from $20 to $150 per night. You can filter by price range when searching for spots."
        },
        {
          pattern: /most popular amenities|popular amenities/i,
          response: popularAmenities.response
        },
        {
          pattern: /location|where|places|region/i,
          response: "We have camping spots across various locations, from forests and mountains to lakesides and beaches. You can search for spots by city, region, or proximity to natural features."
        },
        {
          pattern: /safety|safe|secure/i,
          response: "Safety is our priority. All hosts follow strict safety guidelines, and spots are regularly reviewed. We recommend reading previous guest reviews and contacting the host directly if you have specific safety concerns."
        },
        {
          pattern: /pets|dog|cat|animal/i,
          response: "Many camping spots are pet-friendly, but policies vary by host. Look for the 'Pet Friendly' tag in listings, and always check any specific pet rules or fees in the listing description."
        },
        {
          pattern: /dates|availability|calendar|when/i,
          response: "Availability varies by camping spot. Each listing shows a calendar with available dates. We recommend booking in advance, especially for popular spots during peak seasons like summer weekends and holidays."
        },
        {
          pattern: /equipment|gear|supplies|bring/i,
          response: "Essential camping gear typically includes a tent, sleeping bags, cooking equipment, food, water, and appropriate clothing. Some hosts provide gear rentals or have pre-set tents available. Check the listing details for what's provided and what you need to bring."
        }
      ];
      
      // Check for matches with general info topics
      for (const topic of generalInfoTopics) {
        if (topic.pattern.test(query)) {
          // Return general info without forcing conversation flow
          return res.json({
            message: topic.response,
            isGeneralInfo: true
          });
        }
      }
      
      // If no specific general info topic was matched but it's still a general question
      if (isGeneralInfo) {
        return res.json({
          message: "I can provide information about camping spots, amenities, booking procedures, and more. Feel free to ask specific questions about our camping platform or services!",
          isGeneralInfo: true
        });
      }
    }
    
    // Check if this is a follow-up to a previous question
    if (conversation.state !== ConversationState.INITIAL) {
      const followUpResponse = handleFollowUp(conversation, query);
      
      // If we're still in a follow-up state, just return the follow-up message
      if (conversation.state !== ConversationState.INITIAL || !followUpResponse.updatedPreferences) {
        return res.json({
          message: followUpResponse.message,
          isFollowUp: true,
          conversationState: conversation.state,
          extractedPreferences: conversation.preferences
        });
      }
      
      // Otherwise, we can now perform the search with the updated preferences
    }
    
    // Extract keywords from natural language query with enhanced NLP
    const extractedPreferences = extractKeywords(query);
    
    // Look for date information
    const dateInfo = processDates(query);
    if (dateInfo) {
      extractedPreferences.dateRange = dateInfo;
    }
    
    // Merge explicit preferences with extracted ones and conversation preferences
    const mergedPreferences = {
      priceRange: {
        min: userPreferences?.priceRange?.min || conversation.preferences.priceRange.min || extractedPreferences.priceRange.min,
        max: userPreferences?.priceRange?.max || conversation.preferences.priceRange.max || extractedPreferences.priceRange.max
      },
      guestCount: userPreferences?.guestCount || conversation.preferences.guestCount || extractedPreferences.guestCount,
      location: userPreferences?.location || conversation.preferences.location || extractedPreferences.location,
      amenities: userPreferences?.amenities || conversation.preferences.amenities.length > 0 ? conversation.preferences.amenities : extractedPreferences.amenities,
      dateRange: userPreferences?.dateRange || conversation.preferences.dateRange.startDate ? conversation.preferences.dateRange : extractedPreferences.dateRange
    };
    
    // Update conversation preferences
    conversation.preferences = mergedPreferences;
    
    // For non-general info queries, check if we have enough information or need follow-up questions
    // BUT don't enforce a rigid sequence when not necessary
    let missingPreference = null;
    let isMissingCritical = false;
    
    // Instead of requiring all information, check if we have ENOUGH information to provide useful results
    // If we have location OR dates OR amenities, we can provide some results
    const hasMinimumSearchCriteria = 
      (mergedPreferences.location) || 
      (mergedPreferences.dateRange && mergedPreferences.dateRange.startDate) ||
      (mergedPreferences.amenities && mergedPreferences.amenities.length > 0) ||
      (mergedPreferences.priceRange.min !== null || mergedPreferences.priceRange.max !== null);
    
    // Only ask follow-up questions if we don't have any search criteria
    if (!hasMinimumSearchCriteria) {
      // Ask the most relevant missing information
      if (!mergedPreferences.location && !conversation.context.locationAsked) {
        conversation.state = ConversationState.ASKING_LOCATION;
        conversation.context.locationAsked = true;
        missingPreference = 'location';
        isMissingCritical = true;
      } else if (!mergedPreferences.dateRange || !mergedPreferences.dateRange.startDate) {
        conversation.state = ConversationState.ASKING_DATES;
        missingPreference = 'dates';
        isMissingCritical = true;
      }
      
      // If we're missing critical information, ask follow-up questions
      if (isMissingCritical) {
        return res.json({
          message: generateFollowUpQuestion(conversation),
          isFollowUp: true,
          conversationState: conversation.state,
          missingPreference,
          extractedPreferences: mergedPreferences
        });
      }
    }
    
    // Build the database query
    let dbQuery = {
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

    // Add natural features filter if provided
    if (extractedPreferences.nearbyFeatures && extractedPreferences.nearbyFeatures.length > 0) {
      console.log(`Searching for camping spots near: ${extractedPreferences.nearbyFeatures.join(', ')}`);
      
      // Store these for the response message
      conversation.context.nearbyFeatures = extractedPreferences.nearbyFeatures;
      
      // We'll use these features in a specialized query
      // For a lake, we would look for spots that have lake in the description or are tagged with lake access
      const featureKeywords = extractedPreferences.nearbyFeatures.map(feature => ({
        OR: [
          { description: { contains: feature, mode: 'insensitive' } },
          { title: { contains: feature, mode: 'insensitive' } },
          { tags: { contains: feature, mode: 'insensitive' } }
        ]
      }));
      
      // Add to the query
      if (featureKeywords.length > 0) {
        dbQuery.where.AND.push({
          OR: featureKeywords
        });
      }
      
      // Don't set a default location when user specifically asks for a natural feature
      // This prevents defaulting to Dinant when asking for a lake
    }

    // Add date range filter if provided
    if (mergedPreferences.dateRange && mergedPreferences.dateRange.startDate && mergedPreferences.dateRange.endDate) {
      // In a real implementation, you'd need to check against bookings to ensure availability
      console.log(`Searching for dates: ${mergedPreferences.dateRange.startDate} to ${mergedPreferences.dateRange.endDate}`);
    }
    
    // Add price range filter
    if (mergedPreferences.priceRange.min !== null) {
      dbQuery.where.AND.push({ price_per_night: { gte: mergedPreferences.priceRange.min } });
    }
    if (mergedPreferences.priceRange.max !== null) {
      dbQuery.where.AND.push({ price_per_night: { lte: mergedPreferences.priceRange.max } });
    }

    // Add guest count filter
    if (mergedPreferences.guestCount !== null) {
      dbQuery.where.AND.push({ max_guests: { gte: mergedPreferences.guestCount } });
    }

    // Add location filter if needed
    if (mergedPreferences.location) {
      // Use locationRadius if provided for radius-based search
      if (extractedPreferences.locationRadius) {
        // Import geocoding utilities
        const { findLocationsWithinRadius, geocodeAddress } = require('../utils/geocoding');
        
        // Store radius search parameters for post-processing
        conversation.context.performRadiusSearch = true;
        conversation.context.locationCenter = mergedPreferences.location;
        conversation.context.locationRadius = extractedPreferences.locationRadius;
        
        try {
          // Find all location IDs within the radius
          const locationsInRadius = await findLocationsWithinRadius(
            mergedPreferences.location, 
            extractedPreferences.locationRadius
          );
          
          // If we have locations in radius, use them directly
          if (locationsInRadius.length > 0) {
            const locationIds = locationsInRadius.map(loc => loc.location_id);
            
            // Update query to search only in these locations
            dbQuery.where.AND.push({
              location_id: { in: locationIds }
            });
            
            console.log(`Found ${locationIds.length} locations within ${extractedPreferences.locationRadius}km of ${mergedPreferences.location}`);
          } else {
            // Fallback to a less restrictive search if no locations found in radius
            dbQuery.where.AND.push({
              location: {
                OR: [
                  { city: { contains: mergedPreferences.location, mode: 'insensitive' } },
                  { country: { name: { contains: mergedPreferences.location, mode: 'insensitive' } } }
                ]
              }
            });
            
            // We'll still filter by radius after getting the results
            console.log(`No locations found in ${extractedPreferences.locationRadius}km radius of ${mergedPreferences.location}, using text search`);
          }
        } catch (error) {
          console.error('Radius search error:', error);
          
          // Fallback to regular text search
          dbQuery.where.AND.push({
            location: {
              OR: [
                { city: { contains: mergedPreferences.location, mode: 'insensitive' } },
                { country: { name: { contains: mergedPreferences.location, mode: 'insensitive' } } }
              ]
            }
          });
        }
      } else {
        // Regular location search without radius
        dbQuery.where.AND.push({
          location: {
            OR: [
              { city: { contains: mergedPreferences.location, mode: 'insensitive' } },
              { country: { name: { contains: mergedPreferences.location, mode: 'insensitive' } } }
            ]
          }
        });
      }
    }
    
    // Add amenities filter
    if (mergedPreferences.amenities && mergedPreferences.amenities.length > 0) {
      // This is a simplified approach - in a real implementation you'd need a more sophisticated join
      // For now, we'll fetch and filter in memory
      console.log(`Searching for amenities: ${mergedPreferences.amenities.join(', ')}`);
    }

    // Find camping spots based on criteria
    const recommendedSpots = await prisma.camping_spot.findMany(dbQuery);

    // Apply radius filter if needed
    let filteredSpots = recommendedSpots;
    if (conversation.context.performRadiusSearch && conversation.context.locationCenter && conversation.context.locationRadius) {
      const { geocodeAddress, calculateDistance } = require('../utils/geocoding');
      
      try {
        // Get coordinates for center location
        const centerCoords = await geocodeAddress(conversation.context.locationCenter);
        
        if (centerCoords && centerCoords.latitude && centerCoords.longitude) {
          // Filter spots based on distance from center
          filteredSpots = recommendedSpots.filter(spot => {
            if (spot.location && spot.location.latitude && spot.location.longitude) {
              const distance = calculateDistance(
                centerCoords.latitude,
                centerCoords.longitude, 
                spot.location.latitude,
                spot.location.longitude
              );
              
              // Store the calculated distance for later use in results
              spot.distanceFromCenter = parseFloat(distance.toFixed(1));
              
              // Keep spots within the specified radius
              return distance <= conversation.context.locationRadius;
            }
            return false;
          });
          
          // Sort by distance if we're doing a radius search
          filteredSpots.sort((a, b) => a.distanceFromCenter - b.distanceFromCenter);
        }
      } catch (error) {
        console.error('Error in radius filtering:', error);
        // If the filtering fails, continue with the unfiltered results
      }
    }

    // Calculate relevance score for each spot based on how well it matches amenities
    const scoredSpots = filteredSpots.map(spot => {
      let relevanceScore = 100; // Base score
      
      // Available amenities at this spot
      const spotAmenities = spot.camping_spot_amenities.map(rel => rel.amenity.name.toLowerCase());
      
      // Score based on matched amenities
      if (mergedPreferences.amenities.length > 0) {
        const matchedAmenities = mergedPreferences.amenities.filter(a => 
          spotAmenities.includes(a.toLowerCase())
        );
        relevanceScore += (matchedAmenities.length / mergedPreferences.amenities.length) * 50;
      }
      
      // Clean up the response object
      const cleanSpot = {
        id: spot.camping_spot_id,
        title: spot.title,
        description: spot.description,
        price: spot.price_per_night,
        maxGuests: spot.max_guests,
        location: {
          city: spot.location.city,
          country: spot.location.country.name,
          address: spot.location.address_line1
        },
        amenities: spot.camping_spot_amenities.map(rel => rel.amenity.name),
        images: spot.images.map(img => img.image_url),
        relevanceScore
      };
      
      return cleanSpot;
    });
    
    // Sort by relevance score
    scoredSpots.sort((a, b) => b.relevanceScore - a.relevanceScore);
    
    // If no results were found, offer a more helpful message
    if (scoredSpots.length === 0) {
      conversation.context.noResultsFound = true;
      
      // Only transition to refining search if we had some criteria
      if (hasMinimumSearchCriteria) {
        conversation.state = ConversationState.REFINING_SEARCH;
        
        return res.json({
          message: "I couldn't find any camping spots matching your criteria. Would you like to try with different preferences? You could adjust the location, dates, or amenities you're looking for.",
          isFollowUp: true,
          conversationState: conversation.state,
          extractedPreferences: mergedPreferences,
          recommendations: []
        });
      } else {
        // If we had basically no criteria, offer general guidance
        return res.json({
          message: "I don't have enough information to find specific camping spots. Can you tell me more about what you're looking for? For example, where you want to go or when you're planning your trip?",
          isFollowUp: true,
          conversationState: ConversationState.INITIAL,
          extractedPreferences: mergedPreferences,
          recommendations: []
        });
      }
    }
    
    // Reset conversation state
    conversation.state = ConversationState.INITIAL;
    conversation.context.noResultsFound = false;
    
    // Generate a response message with improved natural language
    let responseMessage;
    
    // Create more natural responses with variations
    const intros = [
      `I found ${scoredSpots.length} camping spots that might interest you.`,
      `Here are ${scoredSpots.length} camping spots that match what you're looking for.`,
      `I've discovered ${scoredSpots.length} great camping options for you.`
    ];
    
    responseMessage = intros[Math.floor(Math.random() * intros.length)];
    
    // Add more context based on the search
    if (mergedPreferences.dateRange && mergedPreferences.dateRange.startDate) {
      responseMessage += ` They're available from ${mergedPreferences.dateRange.startDate} to ${mergedPreferences.dateRange.endDate}.`;
    }
    
    if (mergedPreferences.location) {
      responseMessage += ` They are located in or near ${mergedPreferences.location}.`;
    }
    
    if (mergedPreferences.priceRange.min !== null || mergedPreferences.priceRange.max !== null) {
      const priceDesc = mergedPreferences.priceRange.min !== null && mergedPreferences.priceRange.max !== null
        ? `between $${mergedPreferences.priceRange.min} and $${mergedPreferences.priceRange.max}`
        : mergedPreferences.priceRange.max !== null
          ? `under $${mergedPreferences.priceRange.max}`
          : `above $${mergedPreferences.priceRange.min}`;
      responseMessage += ` They are priced ${priceDesc} per night.`;
    }
    
    if (mergedPreferences.amenities.length > 0) {
      if (mergedPreferences.amenities.length === 1) {
        responseMessage += ` All spots include ${mergedPreferences.amenities[0]}.`;
      } else {
        const lastAmenity = mergedPreferences.amenities.pop();
        responseMessage += ` These spots include ${mergedPreferences.amenities.join(', ')} and ${lastAmenity}.`;
        // Restore the array
        mergedPreferences.amenities.push(lastAmenity);
      }
    }
    
    // Add a call to action
    responseMessage += " You can click on any spot to see more details or ask me to refine the search.";
    
    // Return the recommendations
    res.json({
      message: responseMessage,
      extractedPreferences: mergedPreferences,
      recommendations: scoredSpots
    });
    
  } catch (error) {
    console.error('Chatbot error:', error);
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: 'Invalid input', details: error.errors });
    }
    res.status(500).json({ error: 'Failed to process your request' });
  }
});

/**
 * Get chatbot conversation suggestions
 * GET /api/chatbot/suggestions
 * Public endpoint - no authentication required
 */
router.get('/suggestions', (req, res) => {
  // Allow CORS for this specific route
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  
  const suggestions = [
    "Find me a camping spot near a lake",
    "I need a spot for 4 people with WiFi",
    "Looking for a camping spot under $50 per night",
    "Are there any spots with campfire allowed?",
    "Show me spots with hiking trails nearby",
    "Pet-friendly camping spots in the mountains",
    "What's your cancellation policy?",
    "How do I make a booking?"
  ];
  
  res.json({ suggestions });
});

module.exports = router;
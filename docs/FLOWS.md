# Application Flows Documentation

## Authentication Flow

### 1. User Registration
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database

    User->>Frontend: Enter registration details
    Frontend->>Frontend: Validate input
    Frontend->>Backend: POST /api/auth/register
    Backend->>Backend: Validate data
    Backend->>Backend: Hash password
    Backend->>Database: Create user
    Database-->>Backend: User created
    Backend->>Backend: Generate JWT
    Backend-->>Frontend: Return JWT
    Frontend->>Frontend: Store JWT
    Frontend-->>User: Registration success
```

### 2. User Login
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database

    User->>Frontend: Enter credentials
    Frontend->>Backend: POST /api/auth/login
    Backend->>Database: Find user
    Database-->>Backend: User data
    Backend->>Backend: Verify password
    Backend->>Backend: Generate JWT
    Backend-->>Frontend: Return JWT
    Frontend->>Frontend: Store JWT
    Frontend-->>User: Login success
```

## Booking Flow

### 1. Create Booking
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database

    User->>Frontend: Select dates & spot
    Frontend->>Backend: POST /api/bookings
    Backend->>Database: Check availability
    Database-->>Backend: Availability status
    Backend->>Backend: Validate booking
    Backend->>Database: Create booking
    Database-->>Backend: Booking created
    Backend-->>Frontend: Booking confirmation
    Frontend-->>User: Show confirmation
```

### 2. Cancel Booking
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database

    User->>Frontend: Request cancellation
    Frontend->>Backend: DELETE /api/bookings/:id
    Backend->>Database: Get booking
    Database-->>Backend: Booking data
    Backend->>Backend: Check cancellation policy
    Backend->>Database: Update booking status
    Database-->>Backend: Status updated
    Backend-->>Frontend: Cancellation confirmed
    Frontend-->>User: Show cancellation status
```

## Review Flow

### 1. Submit Review
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database

    User->>Frontend: Write review
    Frontend->>Frontend: Validate input
    Frontend->>Backend: POST /api/reviews
    Backend->>Database: Verify booking
    Database-->>Backend: Booking data
    Backend->>Backend: Validate review eligibility
    Backend->>Database: Create review
    Database-->>Backend: Review created
    Backend->>Database: Update spot rating
    Database-->>Backend: Rating updated
    Backend-->>Frontend: Review confirmation
    Frontend-->>User: Show confirmation
```

## Camping Spot Management Flow

### 1. Create Camping Spot
```mermaid
sequenceDiagram
    participant Owner
    participant Frontend
    participant Backend
    participant Database
    participant Storage

    Owner->>Frontend: Enter spot details
    Frontend->>Frontend: Validate input
    Frontend->>Backend: POST /api/camping-spots
    Backend->>Backend: Validate data
    Backend->>Storage: Upload images
    Storage-->>Backend: Image URLs
    Backend->>Database: Create spot
    Database-->>Backend: Spot created
    Backend-->>Frontend: Creation confirmation
    Frontend-->>Owner: Show confirmation
```

### 2. Update Camping Spot
```mermaid
sequenceDiagram
    participant Owner
    participant Frontend
    participant Backend
    participant Database
    participant Storage

    Owner->>Frontend: Edit spot details
    Frontend->>Frontend: Validate changes
    Frontend->>Backend: PUT /api/camping-spots/:id
    Backend->>Database: Get spot
    Database-->>Backend: Spot data
    Backend->>Backend: Validate ownership
    Backend->>Storage: Update images (if any)
    Storage-->>Backend: New image URLs
    Backend->>Database: Update spot
    Database-->>Backend: Spot updated
    Backend-->>Frontend: Update confirmation
    Frontend-->>Owner: Show confirmation
```

## Search and Filter Flow

### 1. Search Camping Spots
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database

    User->>Frontend: Enter search criteria
    Frontend->>Backend: GET /api/camping-spots/search
    Backend->>Backend: Parse search parameters
    Backend->>Database: Query spots
    Database-->>Backend: Search results
    Backend->>Backend: Apply filters
    Backend->>Backend: Sort results
    Backend-->>Frontend: Return results
    Frontend-->>User: Display results
```

## Payment Flow

### 1. Process Payment
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Payment
    participant Database

    User->>Frontend: Enter payment details
    Frontend->>Backend: POST /api/payments
    Backend->>Backend: Validate payment
    Backend->>Payment: Process payment
    Payment-->>Backend: Payment status
    Backend->>Database: Update booking
    Database-->>Backend: Booking updated
    Backend-->>Frontend: Payment confirmation
    Frontend-->>User: Show confirmation
```

## Chat Flow

### 1. Send Message
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Database
    participant WebSocket

    User->>Frontend: Type message
    Frontend->>Backend: POST /api/messages
    Backend->>Database: Store message
    Database-->>Backend: Message stored
    Backend->>WebSocket: Broadcast message
    WebSocket-->>Frontend: Update chat
    Frontend-->>User: Show message
```

## Error Handling Flow

### 1. API Error Handling
```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Logger

    Client->>Backend: API Request
    Backend->>Backend: Process request
    Backend->>Backend: Error occurs
    Backend->>Logger: Log error
    Logger-->>Backend: Logged
    Backend->>Backend: Format error response
    Backend-->>Client: Error response
```

## Data Validation Flow

### 1. Input Validation
```mermaid
sequenceDiagram
    participant Client
    participant Backend
    participant Validator

    Client->>Backend: Send data
    Backend->>Validator: Validate input
    Validator->>Validator: Check schema
    Validator-->>Backend: Validation result
    Backend->>Backend: Process if valid
    Backend-->>Client: Response
```

## File Upload Flow

### 1. Image Upload
```mermaid
sequenceDiagram
    participant User
    participant Frontend
    participant Backend
    participant Storage
    participant Database

    User->>Frontend: Select image
    Frontend->>Frontend: Validate file
    Frontend->>Backend: POST /api/upload
    Backend->>Backend: Validate file type
    Backend->>Storage: Upload file
    Storage-->>Backend: File URL
    Backend->>Database: Store URL
    Database-->>Backend: URL stored
    Backend-->>Frontend: Upload confirmation
    Frontend-->>User: Show preview
``` 
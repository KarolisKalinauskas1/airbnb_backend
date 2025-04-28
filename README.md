# Airbnb Camping Backend

A Node.js/Express backend for an Airbnb-like camping platform.

## Features

- User authentication and authorization
- Camping listing management
- Booking system
- Image upload and management
- RESTful API endpoints
- Prisma ORM for database management
- Secure session management
- CORS support
- Helmet security headers

## Prerequisites

- Node.js (v14 or higher)
- npm or yarn
- PostgreSQL database
- Prisma CLI

## Setup

1. Clone the repository:
```bash
git clone <repository-url>
cd airbnb-backend
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following variables:
```env
DATABASE_URL="postgresql://user:password@localhost:5432/airbnb_camping"
PORT=3000
SESSION_SECRET="your-secret-key"
CORS_ORIGIN="http://localhost:3000"
```

4. Initialize the database:
```bash
npm run prisma:generate
npm run prisma:migrate
```

## Running the Application

Development mode:
```bash
npm run dev
```

Production mode:
```bash
npm start
```

## API Documentation

The API documentation is available at `/api-docs` when running the server in development mode.

## Testing

Run tests:
```bash
npm test
```

## Project Structure

```
src/
├── config/         # Configuration files
├── controllers/    # Route controllers
├── middleware/     # Custom middleware
├── models/         # Database models
├── routes/         # API routes
├── services/       # Business logic
├── utils/          # Utility functions
├── app.js          # Express application
└── server.js       # Server entry point
```

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License.
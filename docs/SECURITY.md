# Security Documentation

## SQL Injection Prevention

### 1. Prisma ORM Protection
Prisma ORM provides built-in protection against SQL injection through:
- Parameterized queries
- Query sanitization
- Type safety

Example of safe query:
```typescript
// UNSAFE - Direct string concatenation (NEVER DO THIS)
const user = await prisma.$queryRaw`SELECT * FROM users WHERE email = ${email}`;

// SAFE - Using Prisma's query builder
const user = await prisma.user.findUnique({
  where: { email: email }
});
```

### 2. Input Validation
All user inputs are validated using Zod schemas:

```typescript
import { z } from 'zod';

const userSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).regex(/[A-Z]/).regex(/[0-9]/),
  name: z.string().min(2).max(50)
});

// Usage in route handler
app.post('/api/users', async (req, res) => {
  try {
    const validatedData = userSchema.parse(req.body);
    // Process validated data
  } catch (error) {
    return res.status(400).json({ error: 'Invalid input data' });
  }
});
```

### 3. Prepared Statements
For raw SQL queries (when necessary):
```typescript
// SAFE - Using prepared statements
const result = await prisma.$queryRaw`
  SELECT * FROM users 
  WHERE email = ${email} 
  AND status = ${status}
`;
```

## XSS (Cross-Site Scripting) Prevention

### 1. Input Sanitization
```typescript
import { sanitize } from 'sanitize-html';

const sanitizeInput = (input: string): string => {
  return sanitize(input, {
    allowedTags: [], // No HTML tags allowed
    allowedAttributes: {} // No attributes allowed
  });
};
```

### 2. Content Security Policy (CSP)
```typescript
import helmet from 'helmet';

app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    connectSrc: ["'self'", "https://api.example.com"]
  }
}));
```

### 3. Output Encoding
```typescript
import { escape } from 'html-escaper';

const safeOutput = (userInput: string): string => {
  return escape(userInput);
};
```

## CSRF (Cross-Site Request Forgery) Protection

### 1. CSRF Tokens
```typescript
import csrf from 'csurf';

// Generate CSRF token
app.use(csrf());

// Add token to all forms
app.get('/form', (req, res) => {
  res.render('form', { csrfToken: req.csrfToken() });
});

// Validate token in requests
app.post('/submit', csrf(), (req, res) => {
  // Process form submission
});
```

### 2. SameSite Cookies
```typescript
app.use(session({
  cookie: {
    secure: true,
    sameSite: 'strict',
    httpOnly: true
  }
}));
```

## Authentication Security

### 1. Password Hashing
```typescript
import bcrypt from 'bcryptjs';

const hashPassword = async (password: string): Promise<string> => {
  const salt = await bcrypt.genSalt(12);
  return bcrypt.hash(password, salt);
};

const verifyPassword = async (password: string, hash: string): Promise<boolean> => {
  return bcrypt.compare(password, hash);
};
```

### 2. JWT Security
```typescript
import jwt from 'jsonwebtoken';

const generateToken = (userId: string): string => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET!,
    { 
      expiresIn: '1h',
      algorithm: 'HS256'
    }
  );
};

const verifyToken = (token: string): any => {
  try {
    return jwt.verify(token, process.env.JWT_SECRET!);
  } catch (error) {
    throw new Error('Invalid token');
  }
};
```

### 3. Rate Limiting
```typescript
import rateLimit from 'express-rate-limit';

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts
  message: 'Too many login attempts, please try again later'
});

app.use('/api/auth/login', loginLimiter);
```

## File Upload Security

### 1. File Type Validation
```typescript
import multer from 'multer';
import { extname } from 'path';

const storage = multer.diskStorage({
  destination: 'uploads/',
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, file.fieldname + '-' + uniqueSuffix + extname(file.originalname));
  }
});

const fileFilter = (req: any, file: any, cb: any) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type'), false);
  }
};

const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB
  }
});
```

### 2. File Content Scanning
```typescript
import { createReadStream } from 'fs';
import { createInterface } from 'readline';

const scanFile = async (filePath: string): Promise<boolean> => {
  const fileStream = createReadStream(filePath);
  const rl = createInterface({
    input: fileStream,
    crlfDelay: Infinity
  });

  for await (const line of rl) {
    if (line.includes('<?php') || line.includes('<script>')) {
      return false; // Malicious content detected
    }
  }
  return true;
};
```

## API Security

### 1. Request Validation
```typescript
import { z } from 'zod';

const validateRequest = (schema: z.ZodSchema) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      await schema.parseAsync(req.body);
      next();
    } catch (error) {
      res.status(400).json({ error: 'Invalid request data' });
    }
  };
};
```

### 2. API Key Authentication
```typescript
const validateApiKey = (req: Request, res: Response, next: NextFunction) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey || apiKey !== process.env.API_KEY) {
    return res.status(401).json({ error: 'Invalid API key' });
  }
  next();
};
```

## Security Headers

### 1. Helmet Configuration
```typescript
import helmet from 'helmet';

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'"],
      connectSrc: ["'self'"]
    }
  },
  xssFilter: true,
  noSniff: true,
  referrerPolicy: { policy: 'same-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));
```

## Error Handling

### 1. Secure Error Responses
```typescript
const errorHandler = (err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);
  
  if (process.env.NODE_ENV === 'production') {
    res.status(500).json({
      status: 'error',
      message: 'Internal server error'
    });
  } else {
    res.status(500).json({
      status: 'error',
      message: err.message,
      stack: err.stack
    });
  }
};
```

## Security Monitoring

### 1. Request Logging
```typescript
import winston from 'winston';

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
});

const requestLogger = (req: Request, res: Response, next: NextFunction) => {
  logger.info({
    method: req.method,
    path: req.path,
    ip: req.ip,
    userAgent: req.get('user-agent')
  });
  next();
};
```

### 2. Security Event Monitoring
```typescript
const securityLogger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'security.log' })
  ]
});

const logSecurityEvent = (event: string, details: any) => {
  securityLogger.info({
    timestamp: new Date().toISOString(),
    event,
    details
  });
};
``` 
const express = require('express');
const router = express.Router();
const swaggerUi = require('swagger-ui-express');
const openapiSpecification = require('../utils/openapi-generator');

/**
 * @route   GET /api/docs
 * @desc    API documentation UI
 * @access  Public
 */
router.use('/', swaggerUi.serve);
router.get('/', swaggerUi.setup(openapiSpecification, {
  customCss: '.swagger-ui .topbar { display: none }',
  swaggerOptions: {
    persistAuthorization: true
  }
}));

/**
 * @route   GET /api/docs/json
 * @desc    Raw OpenAPI specification
 * @access  Public
 */
router.get('/json', (req, res) => {
  res.json(openapiSpecification);
});

module.exports = router;

// This file has been deprecated. All camping spot routes are now handled in src/features/camping/routes.js
const express = require('express');
const router = express.Router();

// Create a new camping spot
router.post('/', authenticate, upload.array('images'), async (req, res, next) => {
  try {
    const { name, description, price_per_night, max_guests, available_from, available_to, amenities, country } = req.body;
    const images = req.files;

    // Validate required fields
    if (!name || !description || !price_per_night || !max_guests || !available_from || !available_to || !images || images.length === 0) {
      throw new ValidationError('Please provide all required fields: name, description, price_per_night, max_guests, available_from, available_to, and at least one image.');
    }

    // Upload images to Cloudinary
    const imageUploads = images.map(image => cloudinary.uploadImage(image));
    const uploadedImages = await Promise.all(imageUploads);

    // Create camping spot
    const campingSpot = await prisma.campingSpot.create({
      data: {
        name,
        description,
        price_per_night: parseFloat(price_per_night),
        max_guests: parseInt(max_guests),
        available_from: new Date(available_from),
        available_to: new Date(available_to),
        images: {
          create: uploadedImages.map(url => ({ url })),
        },
        // Handle amenities and country separately
      },
    });

    res.status(201).json(campingSpot);
  } catch (error) {
    next(error);
  }
});

// Get a single camping spot by ID
router.get('/:id', async (req, res, next) => {
  try {
    const { id } = req.params;
    const campingSpot = await prisma.campingSpot.findUnique({
      where: { id: parseInt(id) },
      include: {
        images: true,
        reviews: true,
      },
    });

    if (!campingSpot) {
      throw new NotFoundError('Camping spot not found');
    }

    res.json(campingSpot);
  } catch (error) {
    next(error);
  }
});

// Update a camping spot by ID
router.put('/:id', authenticate, upload.array('images'), async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, description, price_per_night, max_guests, available_from, available_to, amenities, country } = req.body;
    const images = req.files;

    // Validate required fields
    if (!name || !description || !price_per_night || !max_guests || !available_from || !available_to) {
      throw new ValidationError('Please provide all required fields: name, description, price_per_night, max_guests, available_from, and available_to.');
    }

    // Find existing camping spot
    const existingCampingSpot = await prisma.campingSpot.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingCampingSpot) {
      throw new NotFoundError('Camping spot not found');
    }

    // Upload new images to Cloudinary if provided
    let uploadedImages = [];
    if (images && images.length > 0) {
      const imageUploads = images.map(image => cloudinary.uploadImage(image));
      uploadedImages = await Promise.all(imageUploads);
    }

    // Update camping spot
    const updatedCampingSpot = await prisma.campingSpot.update({
      where: { id: parseInt(id) },
      data: {
        name,
        description,
        price_per_night: parseFloat(price_per_night),
        max_guests: parseInt(max_guests),
        available_from: new Date(available_from),
        available_to: new Date(available_to),
        images: {
          deleteMany: {}, // Remove existing images
          create: uploadedImages.map(url => ({ url })), // Add new images
        },
        // Handle amenities and country separately
      },
    });

    res.json(updatedCampingSpot);
  } catch (error) {
    next(error);
  }
});

// Delete a camping spot by ID
router.delete('/:id', authenticate, async (req, res, next) => {
  try {
    const { id } = req.params;

    // Find existing camping spot
    const existingCampingSpot = await prisma.campingSpot.findUnique({
      where: { id: parseInt(id) },
    });

    if (!existingCampingSpot) {
      throw new NotFoundError('Camping spot not found');
    }

    // Delete camping spot
    await prisma.campingSpot.delete({
      where: { id: parseInt(id) },
    });

    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
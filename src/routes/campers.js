// ... existing code ...
    // Create the camping spot first
    const campingSpot = await prisma.camping_spot.create({
      data: {
        title,
        description,
        price_per_night: parseFloat(price_per_night),
        max_guests: parseInt(max_guests),
        owner_id,
        location: locationData,
      },
    });

    // Create amenities connections - Fixed parsing
    if (amenities) {
      let amenityIds;
      try {
        // Handle both string and array inputs
        amenityIds = typeof amenities === 'string' ? JSON.parse(amenities) : amenities;
        amenityIds = amenityIds.map(id => parseInt(id));

        console.log('Processing amenities:', amenityIds); // Debug log

        await prisma.camping_spot_amenities.createMany({
          data: amenityIds.map(amenity_id => ({
            camping_spot_id: campingSpot.id,
            amenity_id
          }))
        });
      } catch (error) {
        console.error('Error processing amenities:', error);
        // Continue execution even if amenities fail
      }
    }

    // Handle image uploads with better error handling
    if (req.files && req.files.length > 0) {
      const imagePromises = req.files.map(async (file) => {
        try {
          console.log('Processing file:', file.originalname); // Debug log
          
          const result = await cloudinary.uploader.upload(file.path, {
            folder: 'camping_spots'
          });
          
          console.log('Cloudinary result:', result.secure_url); // Debug log
          
          // Clean up the temp file
          fs.unlinkSync(file.path);
          
          return prisma.camping_spot_image.create({
            data: {
              camping_spot_id: campingSpot.id,
              image_url: result.secure_url,
              created_at: new Date()
            }
          });
        } catch (error) {
          console.error('Error processing image:', error);
          throw error; // Re-throw to be caught by Promise.all
        }
      });

      try {
        await Promise.all(imagePromises);
      } catch (error) {
        console.error('Error saving images:', error);
        // Continue execution even if some images fail
      }
    }

    // Fetch the complete spot with its relations
    const completeSpot = await prisma.camping_spot.findUnique({
      where: { id: campingSpot.id },
      include: {
        amenities: {
          include: {
            amenity: true
          }
        },
        images: true,
        owner: {
          select: {
            id: true,
            email: true,
            first_name: true,
            last_name: true
          }
        }
      }
    });

    res.status(201).json(completeSpot);
// ... existing code ... 
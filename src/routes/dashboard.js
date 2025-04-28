const express = require('express');
const router = express.Router();
const prisma = require('../config/prisma');
const { authenticate } = require('../middleware/auth');

// Get analytics data
router.get('/analytics', async (req, res) => {
  try {
    // Get user ID from request
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in request' });
    }

    // Get total spots
    const totalSpots = await prisma.camping_spot.count({
      where: {
        owner_id: userId
      }
    });

    // Get total bookings (excluding blocked status 5)
    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: userId
      },
      select: {
        camping_spot_id: true
      }
    });

    const spotIds = spots.map(spot => spot.camping_spot_id);
    const totalBookings = await prisma.bookings.count({
      where: {
        camper_id: {
          in: spotIds
        },
        status_id: {
          not: 5 // Exclude blocked bookings
        }
      }
    });

    // Get total revenue (excluding blocked status 5)
    const bookings = await prisma.bookings.findMany({
      where: {
        camper_id: {
          in: spotIds
        },
        status_id: {
          not: 5 // Exclude blocked bookings
        }
      },
      select: {
        cost: true
      }
    });

    const totalRevenue = bookings.reduce((sum, booking) => sum + (booking.cost || 0), 0);

    // Get recent bookings (excluding blocked status 5)
    const recentBookings = await prisma.bookings.findMany({
      where: {
        camper_id: {
          in: spotIds
        },
        status_id: {
          not: 5 // Exclude blocked bookings
        }
      },
      include: {
        camping_spot: true,
        users: {
          select: {
            full_name: true,
            email: true
          }
        },
        status_booking_transaction: true
      },
      orderBy: {
        created_at: 'desc'
      },
      take: 5
    });

    // Map status IDs to human-readable names and colors
    const statusMap = {
      1: { name: 'Pending', color: 'yellow' },
      2: { name: 'Confirmed', color: 'green' },
      3: { name: 'Cancelled', color: 'red' },
      4: { name: 'Completed', color: 'blue' },
      5: { name: 'Blocked', color: 'gray' }
    };

    res.json({
      totalSpots,
      totalBookings,
      totalRevenue,
      recentBookings: recentBookings.map(booking => ({
        id: booking.booking_id,
        spotName: booking.camping_spot?.title || 'Unnamed Spot',
        guestName: booking.users?.full_name || 'Unknown Guest',
        startDate: booking.start_date,
        endDate: booking.end_date,
        revenue: booking.cost,
        status: statusMap[booking.status_id]?.name || 'Unknown',
        statusColor: statusMap[booking.status_id]?.color || 'gray'
      }))
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

// Get owner's spots
router.get('/spots', async (req, res) => {
  try {
    // Get user ID from request
    const userId = req.user?.user_id;
    if (!userId) {
      return res.status(400).json({ error: 'User ID not found in request' });
    }

    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: userId
      },
      include: {
        images: true,
        location: {
          include: { country: true }
        },
        camping_spot_amenities: {
          include: { amenity: true }
        },
        bookings: true
      }
    });

    res.json(spots);
  } catch (error) {
    console.error('Error fetching owner spots:', error);
    res.status(500).json({ error: 'Failed to fetch spots' });
  }
});

// Get bookings for owner's spots
router.get('/bookings', authenticate, async (req, res) => {
  try {
    // Check if user is owner
    if (!req.user || req.user.isowner !== 1) {
      console.log('User owner status:', req.user?.isowner);
      return res.status(403).json({ error: 'Owner account required' });
    }

    // First get all spots owned by the user
    const spots = await prisma.camping_spot.findMany({
      where: {
        owner_id: req.user.user_id
      },
      select: {
        camping_spot_id: true
      }
    });

    if (!spots || spots.length === 0) {
      return res.json([]);
    }

    // Get all bookings for these spots
    const spotIds = spots.map(spot => spot.camping_spot_id);
    
    const bookings = await prisma.bookings.findMany({
      where: {
        camper_id: {
          in: spotIds
        }
      },
      include: {
        camping_spot: true,
        users: {
          select: {
            full_name: true,
            email: true
          }
        }
      },
      orderBy: {
        created_at: 'desc'
      }
    });

    res.json(bookings);
  } catch (error) {
    console.error('Error fetching owner bookings:', error);
    res.status(500).json({ error: 'Failed to fetch bookings' });
  }
});

router.get('/', async (req, res) => {
  try {
    // First find the public user by auth_user_id
    const publicUser = await prisma.public_users.findFirst({
      where: {
        auth_user_id: req.user.id
      }
    });

    if (!publicUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Get the owner record for this user
    const owner = await prisma.owner.findUnique({
      where: {
        owner_id: publicUser.user_id
      },
      include: {
        camping_spot: {
          include: {
            images: true,
            location: true,
            bookings: {
              where: {
                status_id: {
                  not: 5 // Exclude blocked bookings
                }
              },
              include: {
                status_booking_transaction: true,
                users: {
                  select: {
                    full_name: true
                  }
                }
              }
            }
          }
        }
      }
    });

    if (!owner) {
      return res.status(404).json({ error: 'Owner not found' });
    }

    // Transform the data to match frontend expectations
    const transformedData = {
      ...publicUser,
      spots: owner.camping_spot || [],
      bookings: owner.camping_spot.flatMap(spot => 
        spot.bookings.map(booking => ({
          id: booking.booking_id,
          start_date: booking.start_date,
          end_date: booking.end_date,
          cost: booking.cost,
          status: booking.status_booking_transaction?.status || 'unknown',
          guest_name: booking.users?.full_name || 'Unknown Guest',
          created_at: booking.created_at,
          spot: {
            name: spot.title,
            images: spot.images?.map(img => ({
              image_url: img.image_url
            })) || [],
            description: spot.description || '',
            price_per_night: spot.price_per_night || 0,
            location: spot.location || {}
          }
        }))
      )
    };

    res.json(transformedData);
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: error.message });
  }
});

module.exports = router; 
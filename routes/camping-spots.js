// Find the price suggestion endpoint or create it if it doesn't exist
router.get('/:id/price-suggestion', async (req, res) => {
  try {
    const { id } = req.params;
    const spot = await prisma.camping_spot.findUnique({
      where: { camping_spot_id: parseInt(id) },
      include: {
        location: true,
        bookings: true
      }
    });
    
    if (!spot) {
      return res.status(404).json({ error: 'Camping spot not found' });
    }
    
    // Get the current date for seasonal pricing
    const currentDate = new Date();
    const month = currentDate.getMonth(); // 0-11
    
    // Calculate seasonal multiplier (higher in summer months)
    let seasonalMultiplier = 1.0;
    
    // Summer (Jun-Aug): Higher prices
    if (month >= 5 && month <= 7) {
      seasonalMultiplier = 1.25;
    } 
    // Spring (Mar-May) and Fall (Sept-Nov): Medium prices
    else if ((month >= 2 && month <= 4) || (month >= 8 && month <= 10)) {
      seasonalMultiplier = 1.1;
    }
    // Winter (Dec-Feb): Lower prices
    else {
      seasonalMultiplier = 0.9;
    }
    
    // Get the average price of similar spots in the area
    const similarSpots = await prisma.camping_spot.findMany({
      where: {
        camping_spot_id: { not: parseInt(id) },
        location: {
          city: spot.location.city,
          country_id: spot.location.country_id
        },
      }
    });
    
    // Get booking demand for this spot
    const totalBookings = spot.bookings.length;
    const completedBookings = spot.bookings.filter(b => b.status_id === 4).length;
    
    // Calculate demand factor based on booking history
    const demandFactor = totalBookings > 0 ? 
      Math.min(1.3, 1 + (completedBookings / totalBookings) * 0.3) : 
      1.05;
    
    // Calculate market average (if available)
    let marketAverage = spot.price_per_night;
    if (similarSpots.length > 0) {
      const totalPrice = similarSpots.reduce((sum, s) => sum + s.price_per_night, 0);
      marketAverage = totalPrice / similarSpots.length;
    }
    
    // Calculate the base suggestion as a weighted average
    const baseSuggestion = (spot.price_per_night * 0.6) + (marketAverage * 0.4);
    
    // Add a small random variation (-5% to +5%)
    const randomVariation = 0.95 + (Math.random() * 0.1);
    
    // Calculate final suggestion with all factors
    const suggestedPrice = Math.round(baseSuggestion * seasonalMultiplier * demandFactor * randomVariation);
    
    // Get min and max for the suggestion range (±10%)
    const minSuggestion = Math.round(suggestedPrice * 0.9);
    const maxSuggestion = Math.round(suggestedPrice * 1.1);
    
    res.json({ 
      currentPrice: spot.price_per_night,
      suggestedPrice: suggestedPrice,
      minSuggestion: minSuggestion,
      maxSuggestion: maxSuggestion,
      factors: {
        season: seasonalMultiplier > 1 ? "peak" : seasonalMultiplier < 1 ? "off-peak" : "standard",
        demand: demandFactor > 1.1 ? "high" : "normal",
        similarSpots: similarSpots.length,
        marketAverage: Math.round(marketAverage)
      }
    });
  } catch (error) {
    console.error('Price suggestion error:', error);
    res.status(500).json({ error: 'Failed to generate price suggestion' });
  }
});

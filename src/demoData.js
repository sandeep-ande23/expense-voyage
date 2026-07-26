const DEMO_TRIP_ID = "portfolio-demo-trip";

export function createPortfolioDemo(account) {
  const owner = { id: account.id, name: account.name, email: account.email };
  const maya = { id: "demo-maya", name: "Maya Patel", email: "maya@example.com" };
  const arjun = { id: "demo-arjun", name: "Arjun Shah", email: "arjun@example.com" };
  const participants = [owner, maya, arjun];
  const split = (amount) => participants.map((person) => ({ id: person.id, amount: amount / participants.length }));

  return {
    trip: {
      id: DEMO_TRIP_ID,
      name: "Goa Getaway",
      destination: "Goa, India",
      startDate: "2026-01-16",
      endDate: "2026-01-19",
      budget: 30000,
      currency: { code: "INR", symbol: "₹" },
      code: "GOA202",
      ownerEmail: account.email,
      participants,
    },
    data: {
      expenses: [
        { id: "demo-1", title: "Beach shack dinner", amount: 2400, category: "food", date: "2026-01-16", time: "20:30", paidBy: owner.id, splits: split(2400) },
        { id: "demo-2", title: "Hotel stay", amount: 12600, category: "stay", date: "2026-01-16", time: "14:00", paidBy: maya.id, splits: split(12600) },
        { id: "demo-3", title: "Airport transfers", amount: 1800, category: "transport", date: "2026-01-16", time: "11:15", paidBy: arjun.id, splits: split(1800) },
        { id: "demo-4", title: "Water sports", amount: 3600, category: "activities", date: "2026-01-18", time: "10:00", paidBy: owner.id, splits: split(3600) },
      ],
      settlements: [],
      notes: "Hotel check-in is from 2 PM. Keep sunscreen and a printed copy of the booking confirmation handy.",
      itinerary: [
        { id: "demo-i1", date: "2026-01-16", dayLabel: "Day 1", activity: "Arrive, check in, and sunset dinner" },
        { id: "demo-i2", date: "2026-01-18", dayLabel: "Day 3", activity: "Water sports and evening market" },
      ],
    },
  };
}

// League settings and prize rules. Change these and redeploy; everything else is live from FPL.
window.LEAGUE = {
  leagueId: 292439,
  name: 'I Love You 3000',
  currency: '₹',
  entryFee: 500,

  // Manager of the Week, paid for every finished gameweek.
  motw: {
    amount: 150,
    // 'gross' = gameweek points as FPL shows them in the league table (before transfer hits).
    // 'net'   = gameweek points minus transfer hits.
    points: 'gross',
    // Tie-break on fewest regular transfers made in 'gw' (that gameweek) or 'season' (season so far).
    // Wildcard and Free Hit transfers never count.
    tiebreak: 'gw',
  },

  // End-of-season prizes by final league rank.
  top: [4500, 2700, 1900, 1300, 900],

  // Best performance with each chip, paid at the end of the season.
  chips: {
    wildcard: { amount: 250, label: 'Wildcard', rule: 'Highest gameweek score in the week it was played' },
    freehit: { amount: 250, label: 'Free Hit', rule: 'Highest gameweek score in the week it was played' },
    '3xc': { amount: 250, label: 'Triple Captain', rule: 'Most captain points (×3) in the week it was played' },
    bboost: { amount: 250, label: 'Bench Boost', rule: 'Most bench points in the week it was played' },
  },
};

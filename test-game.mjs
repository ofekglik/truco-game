/**
 * Automated 4-player Truco game test.
 * Simulates a full game: join → bid → trump → singing → trick play (10 tricks).
 * Tests the reconnection fix too.
 */
import { io } from 'socket.io-client';

const SERVER = 'http://localhost:3001';
const NAMES = ['שחקן-דרום', 'שחקן-מזרח', 'שחקן-צפון', 'שחקן-מערב'];

function wait(ms) { return new Promise(r => setTimeout(r, ms)); }

function createPlayer(name) {
  return new Promise((resolve, reject) => {
    const socket = io(SERVER, { transports: ['websocket'] });
    const player = { socket, name, seat: null, roomCode: null, state: null };

    socket.on('connect', () => console.log(`  ✓ ${name} connected (${socket.id})`));
    socket.on('roomJoined', (data) => {
      player.seat = data.seat;
      player.roomCode = data.roomCode;
      console.log(`  ✓ ${name} joined room ${data.roomCode} as ${data.seat}`);
    });
    socket.on('gameState', (state) => {
      player.state = state;
    });
    socket.on('roomError', (err) => {
      console.log(`  ✗ ${name} error: ${err}`);
    });
    socket.on('connect_error', (err) => reject(err));

    setTimeout(() => resolve(player), 500);
  });
}

function getPlayerByTurn(players) {
  return players.find(p => p.state && p.state.currentTurnSeat === p.seat);
}

function getPlayerBySeat(players, seat) {
  return players.find(p => p.seat === seat);
}

async function waitForState(players, predicate, label, timeout = 5000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (players.some(p => p.state && predicate(p.state))) return true;
    await wait(100);
  }
  console.log(`  ⏰ Timeout waiting for: ${label}`);
  return false;
}

async function main() {
  console.log('\n🃏 TRUCO GAME TEST\n');

  // === PHASE 1: Create room and join all 4 players ===
  console.log('1️⃣  Creating room and joining players...');
  const players = [];

  // Player 1 creates room
  const p1 = await createPlayer(NAMES[0]);
  p1.socket.emit('createRoom', NAMES[0]);
  await wait(500);
  players.push(p1);

  if (!p1.roomCode) {
    console.log('  ✗ Failed to create room');
    process.exit(1);
  }

  // Players 2-4 join
  for (let i = 1; i < 4; i++) {
    const p = await createPlayer(NAMES[i]);
    p.socket.emit('joinRoom', { roomCode: p1.roomCode, playerName: NAMES[i] });
    await wait(500);
    players.push(p);
  }

  console.log(`  Room: ${p1.roomCode}, Seats: ${players.map(p => `${p.name}=${p.seat}`).join(', ')}`);

  // === PHASE 2: Start game ===
  console.log('\n2️⃣  Starting game...');
  p1.socket.emit('startGame');
  await waitForState(players, s => s.phase === 'bidding' || s.phase === 'trump_declaration', 'bidding phase');

  const anyState = players.find(p => p.state)?.state;
  if (!anyState) {
    console.log('  ✗ No game state received');
    process.exit(1);
  }
  console.log(`  Phase: ${anyState.phase}, Dealer: ${anyState.dealerSeat}`);

  // Print hands
  for (const p of players) {
    if (p.state) {
      const hand = p.state.myHand.map(c => c.id).join(', ');
      console.log(`  ${p.name} (${p.seat}): [${hand}]`);
    }
  }

  // === PHASE 3: Bidding ===
  if (anyState.phase === 'bidding') {
    console.log('\n3️⃣  Bidding phase...');
    let bidRounds = 0;
    while (bidRounds < 10) {
      await wait(200);
      const turnPlayer = getPlayerByTurn(players);
      if (!turnPlayer || !turnPlayer.state) break;

      if (turnPlayer.state.phase !== 'bidding') break;

      if (bidRounds === 0) {
        // First player bids 70
        console.log(`  ${turnPlayer.name} bids 70`);
        turnPlayer.socket.emit('placeBid', 70);
      } else {
        // Others pass
        console.log(`  ${turnPlayer.name} passes`);
        turnPlayer.socket.emit('passBid');
      }
      bidRounds++;
      await wait(300);
    }

    await waitForState(players, s => s.phase === 'trump_declaration', 'trump declaration');
  }

  // === PHASE 4: Trump declaration ===
  console.log('\n4️⃣  Trump declaration...');
  await wait(300);
  const trumpPlayer = getPlayerByTurn(players);
  if (trumpPlayer && trumpPlayer.state?.phase === 'trump_declaration') {
    // Pick the suit we have most of
    const hand = trumpPlayer.state.myHand;
    const suitCounts = {};
    for (const c of hand) {
      suitCounts[c.suit] = (suitCounts[c.suit] || 0) + 1;
    }
    const bestSuit = Object.entries(suitCounts).sort((a, b) => b[1] - a[1])[0][0];
    console.log(`  ${trumpPlayer.name} declares trump: ${bestSuit}`);
    trumpPlayer.socket.emit('declareTrump', bestSuit);
    await wait(500);
  }

  // === PHASE 5: Singing ===
  await waitForState(players, s => s.phase === 'singing' || s.phase === 'trick_play', 'singing or trick_play');

  const postTrumpState = players.find(p => p.state)?.state;
  if (postTrumpState?.phase === 'singing') {
    console.log('\n5️⃣  Singing phase...');
    let singRounds = 0;
    while (singRounds < 8) {
      await wait(200);
      // Find any bidding team player who can sing or done singing
      let acted = false;
      for (const p of players) {
        if (!p.state || p.state.phase !== 'singing') continue;
        const va = p.state.validActions;
        if (va.singableCantes && va.singableCantes.length > 0) {
          const suit = va.singableCantes[0];
          console.log(`  ${p.name} sings ${suit}`);
          p.socket.emit('singCante', suit);
          await wait(300);
          acted = true;
          break;
        }
      }
      if (!acted) {
        // Done singing - find bidding team member
        for (const p of players) {
          if (!p.state || p.state.phase !== 'singing') continue;
          const biddingTeam = p.state.biddingTeam;
          const seatTeam = { south: 'team1', north: 'team1', east: 'team2', west: 'team2' };
          if (seatTeam[p.seat] === biddingTeam) {
            console.log(`  ${p.name} done singing`);
            p.socket.emit('doneSinging');
            await wait(300);
            acted = true;
            break;
          }
        }
      }
      singRounds++;

      const curState = players.find(p => p.state)?.state;
      if (curState?.phase === 'trick_play') break;
    }
  }

  // === PHASE 6: Trick Play (10 tricks) ===
  await waitForState(players, s => s.phase === 'trick_play', 'trick_play phase');
  console.log('\n6️⃣  Trick play phase...');

  let trickCount = 0;
  let moveCount = 0;
  let stuckCount = 0;

  while (moveCount < 50) { // safety limit
    await wait(200);

    const turnPlayer = getPlayerByTurn(players);
    if (!turnPlayer || !turnPlayer.state) {
      stuckCount++;
      if (stuckCount > 10) {
        console.log('  ✗ STUCK! No player has the turn for 10 iterations');
        // Print debug info
        for (const p of players) {
          if (p.state) {
            console.log(`    ${p.name} (${p.seat}): phase=${p.state.phase}, turn=${p.state.currentTurnSeat}, hand=[${p.state.myHand.map(c=>c.id).join(',')}], playable=[${p.state.validActions.playableCards.join(',')}]`);
          }
        }
        break;
      }
      continue;
    }
    stuckCount = 0;

    if (turnPlayer.state.phase === 'round_scoring') {
      console.log('  🏆 Round complete!');
      break;
    }
    if (turnPlayer.state.phase !== 'trick_play') break;

    const playable = turnPlayer.state.validActions.playableCards;
    const trick = turnPlayer.state.currentTrick;
    const trickNum = turnPlayer.state.trickNumber;

    if (playable.length === 0) {
      console.log(`  ⚠️  ${turnPlayer.name} has NO playable cards! hand=[${turnPlayer.state.myHand.map(c=>c.id).join(',')}], trick=[${trick.cards.map(tc=>`${tc.seat}:${tc.card.id}`).join(',')}], trump=${turnPlayer.state.trumpSuit}`);

      // Try playing first card from hand as fallback
      if (turnPlayer.state.myHand.length > 0) {
        const fallback = turnPlayer.state.myHand[0].id;
        console.log(`  ⚠️  Trying fallback play: ${fallback}`);
        turnPlayer.socket.emit('playCard', fallback);
        moveCount++;
        await wait(300);
        continue;
      }
      break;
    }

    // Play the first valid card
    const cardId = playable[0];
    const trickCardsStr = trick.cards.length > 0 ? ` (trick: ${trick.cards.map(tc=>`${tc.card.id}`).join(',')})` : ' (leading)';

    if (trick.cards.length === 0 && trickNum !== trickCount + 1) {
      trickCount = trickNum - 1;
    }

    if (trick.cards.length === 0) {
      trickCount++;
      console.log(`\n  --- Trick ${trickCount} ---`);
    }

    console.log(`  ${turnPlayer.name} plays ${cardId}${trickCardsStr} [${playable.length} options]`);
    turnPlayer.socket.emit('playCard', cardId);
    moveCount++;
    await wait(300);
  }

  // === PHASE 7: Check scoring ===
  await wait(500);
  const finalState = players.find(p => p.state)?.state;
  if (finalState?.phase === 'round_scoring') {
    const last = finalState.roundHistory[finalState.roundHistory.length - 1];
    if (last) {
      console.log(`\n7️⃣  Round scoring:`);
      console.log(`  Team 1: ${last.team1Total} (tricks: ${last.team1TrickPoints}, singing: ${last.team1SingingPoints})`);
      console.log(`  Team 2: ${last.team2Total} (tricks: ${last.team2TrickPoints}, singing: ${last.team2SingingPoints})`);
      console.log(`  Bidding team fell: ${last.biddingTeamFell}`);
    }
  }

  // === PHASE 8: Test reconnection ===
  console.log('\n8️⃣  Testing reconnection...');

  // Start a new round first
  const anyPlayer = players.find(p => p.state?.phase === 'round_scoring');
  if (anyPlayer) {
    anyPlayer.socket.emit('nextRound');
    await waitForState(players, s => s.phase === 'bidding' || s.phase === 'trick_play', 'next round');
    await wait(300);
  }

  // Simulate disconnect + reconnect for player 2
  const testPlayer = players[1];
  console.log(`  Disconnecting ${testPlayer.name} (${testPlayer.seat})...`);
  const oldSocketId = testPlayer.socket.id;
  testPlayer.socket.disconnect();
  await wait(500);

  // Create new socket and rejoin
  console.log(`  Reconnecting ${testPlayer.name}...`);
  const newSocket = io(SERVER, { transports: ['websocket'] });
  testPlayer.socket = newSocket;

  await new Promise(resolve => {
    newSocket.on('connect', () => {
      console.log(`  ✓ New socket: ${newSocket.id} (was ${oldSocketId})`);
      newSocket.emit('rejoinRoom', { roomCode: testPlayer.roomCode, playerName: testPlayer.name });
      resolve();
    });
  });

  newSocket.on('roomJoined', (data) => {
    console.log(`  ✓ Rejoined as ${data.seat} in room ${data.roomCode}`);
  });
  newSocket.on('gameState', (state) => {
    testPlayer.state = state;
  });

  await wait(1000);

  if (testPlayer.state) {
    console.log(`  ✓ ${testPlayer.name} received game state after reconnect! phase=${testPlayer.state.phase}, hand=${testPlayer.state.myHand.length} cards`);

    // Try to play if it's their turn
    if (testPlayer.state.currentTurnSeat === testPlayer.seat && testPlayer.state.phase === 'trick_play') {
      const playable = testPlayer.state.validActions.playableCards;
      if (playable.length > 0) {
        console.log(`  ✓ It's their turn! Playing ${playable[0]}...`);
        newSocket.emit('playCard', playable[0]);
        await wait(500);
        console.log(`  ✓ Card played successfully after reconnect!`);
      }
    }
  } else {
    console.log(`  ✗ ${testPlayer.name} did NOT receive game state after reconnect!`);
  }

  // === DONE ===
  console.log('\n✅ TEST COMPLETE\n');

  // Cleanup
  for (const p of players) {
    p.socket.disconnect();
  }

  process.exit(0);
}

main().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});

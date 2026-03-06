# Truco Game - Major UX/UI Overhaul Plan

## Summary
Complete redesign of the Truco card game with corrected rules, new room lobby system, drag-to-reorder cards, post-trick score popups, card animations, sound/haptics, and responsive design for all devices.

---

## Phase 1: Game Rules Fixes (Server)

### 1A. Scoring System Overhaul
**Current**: Teams score actual trick+singing points.
**Correct**: The bid amount is the only score that matters.
- If bidding team's trick+singing points ≥ bid → **bidding team scores +bid**
- If bidding team's points < bid → **other team scores +bid**
- Capo (230): same logic but bid = 230
- Technical Capo: if first trick won → capo team +230, else other team +230

**Files**: `server/src/engine/game.ts` (endRound function)

### 1B. Singing During Trick Play (not before)
**Current**: Singing is a separate phase before trick play.
**Correct**: Bidding team can sing only AFTER winning a trick.
- Remove `SINGING` as a standalone phase
- After a bidding team member wins a trick, check if anyone on bidding team can sing
- If yes → enter a brief `SINGING` sub-state before next trick lead
- Both bidding team members can sing their cantes during this window
- Then trick play resumes with the winner leading

**Files**: `server/src/engine/game.ts` (playCard, new singing-after-trick logic), `server/src/engine/types.ts` (phase enum changes)

### 1C. Custom Target Score
- Add `targetScore` to GameState (set by room creator, default 1000)
- After each round scoring, check if either team ≥ targetScore → `GAME_OVER`
- Add `targetScore` to ClientGameState so UI can show progress

**Files**: `server/src/engine/types.ts`, `server/src/engine/game.ts`

---

## Phase 2: Room Lobby System (Server + Client)

### 2A. Server: Room Configuration
- Add seat-swap capability: player can request to move to empty seat
- Add `roomSettings` to Room: { targetScore, creatorSeat }
- Add socket events: `swapSeat`, `updateSettings`
- Room creator can set target score before starting

### 2B. Client: Home Screen Redesign
- Clean landing page with game logo/title
- Two main buttons: "צור חדר" (Create Room) and "הצטרף לחדר" (Join Room)
- Create Room → popup with name input + target score slider (500-2000, default 1000)
- Join Room → popup with name + room code input
- Show room code prominently once created (easy to share)

### 2C. Client: Visual Table Lobby
- Card table view with 4 chairs at N/S/E/W positions
- Each chair shows: empty (clickable to sit) or player name + avatar
- Team indicators: Team 1 (blue, N+S) vs Team 2 (red, E+W)
- Players can click empty chairs to move seats
- Room code display with copy button
- Target score display
- "התחל משחק" (Start Game) button for room creator (enabled when 4 players)
- Real-time updates as players join

---

## Phase 3: Card Reordering (Client)

### 3A. Drag-to-Reorder Hand
- On desktop: click-and-drag cards to reorder
- On mobile: long-press (~300ms) to pick up card, drag to new position
- Visual feedback: picked-up card lifts and follows finger/cursor with shadow
- Other cards spread apart to show drop zone
- Card order persists within a round (stored in local component state)
- Does NOT affect server state (purely visual/client-side)

**Implementation**: Custom drag handler on the hand container. Track card order in state array. Use CSS transforms for smooth animation.

---

## Phase 4: Post-Trick Score Popup (Client)

### 4A. Trick Result Toast
- After each trick completes (4 cards played), show a brief overlay:
  - Who won the trick (winner name + seat)
  - Current trick score: "Team 1: X | Team 2: Y" (trick count, not points)
  - If singing happened: show cante points earned
- Auto-dismiss after 2 seconds
- Slide-in animation from top
- Semi-transparent background, doesn't block the table

---

## Phase 5: Card Animations (Client)

### 5A. Card Play Animation
- When a card is played, animate it from player's hand to the center trick area
- Use CSS transitions/transforms (translateX/Y) with ~300ms duration
- Card flips from back to front for other players' cards

### 5B. Trick Collection Animation
- When trick completes, all 4 cards slide toward the winner's position
- Brief pause, then cards fade out
- Next trick starts after animation completes

### 5C. Deal Animation
- At round start, cards animate from center deck to each player's hand
- Fan-out effect for the player's own cards

---

## Phase 6: Sound & Haptics (Client)

### 6A. Sound Effects
- Card play: soft "thwack" sound
- Your turn: gentle chime notification
- Trick won (your team): positive sound
- Round won: victory fanfare
- Round lost: subtle low tone
- Toggle on/off in settings (persisted in localStorage)

### 6B. Haptic Feedback (Mobile)
- Short vibration when it's your turn
- Light vibration on card play confirmation
- Uses `navigator.vibrate()` API
- Toggle on/off in settings

---

## Phase 7: Responsive Design Polish (Client)

### 7A. Mobile-First Layout
- Cards scale based on screen width
- Hand cards use horizontal scroll on very small screens
- Confirmation popup positioned above thumb reach
- All touch targets ≥ 44px
- Safe area insets for iPhone notch/home indicator

### 7B. Desktop Enhancements
- Hover effects on cards (lift + glow)
- Keyboard shortcuts (number keys to select cards)
- Wider table layout utilizing screen space

### 7C. Tablet/iPad Support
- Intermediate layout between mobile and desktop
- Larger card sizes, more spacing

---

## Phase 8: Singing UI During Tricks (Client)

### 8A. Post-Trick Singing Popup
- After bidding team wins a trick, show singing panel
- Display which cantes are available for each team member
- "שר" (Sing) buttons for each available cante
- "סיים" (Done) button to skip/finish singing
- Once both team members done → resume trick play

---

## Implementation Order (Recommended)

1. **Phase 1** (Rules fixes) — Foundation, must be first
2. **Phase 2** (Room lobby) — New entry point for the game
3. **Phase 3** (Card reordering) — High-impact UX improvement
4. **Phase 8** (Singing UI) — Depends on Phase 1B
5. **Phase 4** (Score popup) — Quick win, visual polish
6. **Phase 5** (Animations) — Visual polish
7. **Phase 6** (Sound/haptics) — Finishing touches
8. **Phase 7** (Responsive) — Ongoing, but focused pass at end

---

## Technical Notes

- All animations use CSS transitions (no animation libraries needed)
- Sound files: small MP3s bundled with client build
- Card reorder is purely client-side (no server changes)
- Room lobby reuses existing Socket.IO room infrastructure
- Multiple concurrent games already supported by server architecture

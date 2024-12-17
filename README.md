## Inspiration
Simon memory games

## What it does
It tests short-term memory skill. At first it generates a series of colors from post id.
* Beginning from a single light. Players mimic the color patterns lighting up.
* When the player pass the top score, they lead the way by selecting a new color. And so on.
* When the player make a wrong guess, they replay from the beginning.

## How we built it
I've built it using devvit blocks. When the chain lengthen, it is saved into the redis and also passed to the other players that are currently viewing the post, through the channels.

## Challenges we ran into
* **Cannot use timers**. The game is impossible to build without timers. A single `useInterval`, since not synced to the button presses caused lights to appear laggy. Its 1000ms minimum interval requirement was too long for the game and I chose a smaller interval. It somewhat works, but sometimes there are delays in it.
    * **`<button>` as an alternative**. It was my first idea for the color plates. But their `appearance` set to a fixed set of colors and cannot be programmatically look pressed when lighting up the pattern.
    * I've planned to stop/start the timer to sync with button presses. Though, even with `interval.stop()` interval still runs, so I've let it run and build the game around a single interval.
* **Channels was not reliable** I was updating the leader and memory of other peers via channels, to prevent players playing at the same time to both be winners. If a player completes before, other still had to pass them. But it was not reliable.
    * Switched to `realtime` which curiously work.
* **Async, state and render** It seems `setState` within `async` functions does not re-render the components. I'm logging their new values to see they have been successfully set. Blocking was not an issue for this case. *But conditional component is not rendered.* This behaviour is not seem to be documented.
  * As an alternative `useAsync` hook should be at the top level. As documented there is no easy way to call it in response to user action.
  * Ended up acting `onMessage` in response to `realtime.send`
* **Performance** is sometimes flaky compared to a pure javascript implementation, even though it is a simple game. I suspect useInterval for it, since flakiness is still there without any (non)blocking network request.
* **Debugging** There were issues with the realtime channels, where updates are not rendered on other clients. It is hard to debug anywhere, and devvit also does not make it easier.

## Accomplishments that we're proud of
Learned and made a complete game using reddit blocks, realtime and redis APIs.

## What we learned
`useInterval` is not enough for timing a game. Developer should resort to webviews, if there needs to be a timer.

## What's next for SnooSays
Game is fundamentally complete. If there were user requests, they may be considered for implementation.

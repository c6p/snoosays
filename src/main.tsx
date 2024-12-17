// Learn more at developers.reddit.com/docs
import { Devvit, useState, useAsync, useInterval, useChannel } from '@devvit/public-api'

Devvit.configure({
  redis: true,
  realtime: true,
  redditAPI: true,
});

// Add a trigger to clear the memory and leaderboard when a post is deleted
Devvit.addTrigger({
  event: 'PostDelete',
  onEvent: async ({ postId }, { redis }) => {
    await redis.del(`memory:${postId}`);
    await redis.del(`leaderboard:${postId}`);
    console.log('Deleted memory and leaderboard for post', postId);
  }
});

// Add a menu item to the subreddit menu for instantiating the new experience post
Devvit.addMenuItem({
  label: 'Add my post',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    const { reddit, ui } = context;
    ui.showToast("Submitting your post - upon completion you'll navigate there.");

    const subreddit = await reddit.getCurrentSubreddit();
    const now = new Date().toISOString()
    const post = await reddit.submitPost({
      title: `Snoo says ${now}`,
      subredditName: subreddit.name,
      // The preview appears while the post loads
      preview: (
        <vstack height="100%" width="100%" alignment="middle center">
          <text size="large">Loading ...</text>
        </vstack>
      ),
    });
    ui.navigateTo(post);
  },
});

type Score = { member: string, score: number }

type Message = {
  postId: string;
  memory: number[];
  leader: string;
};

// Add a post type definition
Devvit.addCustomPostType({
  name: 'Snoo Says',
  render: ({ reddit, redis, realtime, postId, userId }) => {
    const [started, setStarted] = useState<boolean>(false)
    if (!postId) return <text>Error: Missing post id</text>;

    const { data, loading, error } = useAsync(async () => await Promise.all([
      (async () => {
        if (!userId) return "" // throw new Error('Missing user id')
        const user = await reddit.getUserById(userId)
        if (!user) throw new Error('User not found')
        return user.username
      })(),
      (async () => {
        const value = await redis.get(`memory:${postId}`)
        if (value && value.length > 0) {
          return value.split('').map(Number)
        } else {
          // generate random sequence of t3_ length 4 in base4 from postId
          const memory = [...postId.slice(-4)].map(c => Number(c.charCodeAt(0).toString(4).slice(-1)))
          redis.set(`memory:${postId}`, memory.join(''))
          return memory;
        }
      })(),
      (async () => {
        const leaders = await redis.zRange(`leaderboard:${postId}`, 0, 0, { by: "rank", reverse: true })
        const { member = 'Snoo', score = 0 } = leaders?.[0] ?? {};
        // Maybe: check score matches memory length
        return member
      })()
    ]));
    if (loading) return <text alignment='middle center'>Loading ...</text>;
    if (error) return <text>Error: {error.message}</text>;
    if (!data) return <text>Error: No data</text>;
    const [userName, postMemory, postLeader] = data

    const [leader, setLeader] = useState<string>(postLeader)
    const [memory, setMemory] = useState<number[]>(postMemory)

    type Background = { color: string, highlight: string }
    const colors: [Background, Background, Background, Background] = [
      { color: "KiwiGreen-600", highlight: "KiwiGreen-300" },
      { color: "Red-600", highlight: "Red-300" },
      { color: "Yellow-600", highlight: "Yellow-300" },
      { color: "AlienBlue-600", highlight: "AlienBlue-300" }
    ]
    const [highlights, setHighlights] = useState<[boolean, boolean, boolean, boolean]>([false, false, false, false])
    const [index, setIndex] = useState<number>(-1)
    const [touches, setTouches] = useState<number[]>([])
    const [gameLen, setGameLen] = useState<number>(1)
    const [light, setLight] = useState<boolean>(false)
    const [game, setGame] = useState<boolean>(true)
    const BG = "neutral-background"
    const [bg, setBg] = useState<string>(BG)
    const [tab, setTab] = useState<number>(0)

    const channel = useChannel<Message>({
      name: 'events',
      onMessage: (msg) => {
        console.log(msg, userName, postId, memory)
        if (msg.postId !== postId) {
          return;
        }
        // if old leader
        if (leader === userName) {
          setTouches([])
          setGameLen(1)
          reset(-1)
        }
        setLeader(msg.leader)
        setMemory(msg.memory)
      },
    });

    channel.subscribe();

    const reset = (index = 0, wrong = false) => {
      setGame(false)
      setLight(false)
      setIndex(index)
      if (wrong) {
        setBg("neutral-border")
      }
    }

    const highlight = (index: number | false) => {
      const highlighted: [boolean, boolean, boolean, boolean] = [false, false, false, false]
      if (index !== false)
        highlighted[index] = true
      setHighlights(highlighted)
    }

    const playbackMemory = () => {
      if (index === 0) setBg(BG)
      if (!light) {
        highlight(false)
      } else {
        const m = memory[index]
        highlight(m)
        if (index + 1 >= gameLen) {
          setIndex(memory.length)
          setGame(true)
        } else {
          setIndex(index + 1)
        }
      }
      setLight(!light)
    }

    const addMemory = async (color: number) => {
      // send new data to other clients and redis
      const txn = await redis.watch('memory');
      await txn.setRange(`memory:${postId}`, memory.length, color.toString())
      await txn.zAdd(`leaderboard:${postId}`, { member: userName, score: memory.length + 1 })
      await txn.exec()
      await realtime.send("events", { postId, memory: [...memory, color], leader: userName })
    }

    const play = (color: number) => {
      if (!game) return
      highlight(color)
      const len = touches.length
      if (len + 1 > memory.length) {
        addMemory(color)
      } else if (color === memory[len]) {
        if (len + 1 === gameLen) {
          setTouches([])
          setGameLen(gameLen + 1)
          reset(-1)
        } else {
          setTouches([...touches, color])
        }
      } else {  // wrong
        setTouches([])
        setGameLen(1)
        reset(-1, true)
      }
    }

    const Plate = ({ index }: { index: number }) => {
      const { color, highlight } = colors[index]
      const highlighted = highlights[index]
      return (<zstack width="96px" backgroundColor={highlighted ? highlight : color} cornerRadius="small" onPress={() => play(index)} />)
    }

    const LeaderBtn = () => {
      return (<button onPress={() => setTab(1)} icon="top" size="small">Leaderboard</button>)
    }

    const ScoreList = ({ data }: { data: Score[] }) => {
      return (
        <vstack gap="small">
          {data.map(({ member, score }, i) => (
            <hstack>
              <text>{i + 1}. {member}</text>
              <spacer grow />
              <text>{score}</text>
            </hstack>
          ))}
        </vstack>
      )
    }

    const Leaderboard = () => {
      const { data, loading, error } = useAsync<Score[]>(async () => {
        return await redis.zRange(`leaderboard:${postId}`, 0, 10, { by: "rank", reverse: true })
      })
      return (<vstack gap="medium">
        <spacer />
        {error ? <text>Error: {error.message}</text>
          : (loading ? <text>Loading...</text> : <ScoreList data={data ?? []} />)}
        <spacer grow />
        <button onPress={() => setTab(0)} icon="back" size="small">Back</button>
        <spacer />
      </vstack>)
    }


    const Game = () => {
      return (
        <zstack>
          <vstack height="100%" gap="medium">
            <spacer size="xsmall" />
            <hstack>
              {touches.length === memory.length
                ? (<text>Select COLOR to LEAD</text>)
                : (<>
                  <text>{leader} Says</text>
                  <spacer grow />
                  <text>{game ? `${touches.length} / ${memory.length}` : 'WATCH'}</text>
                </>)}
            </hstack>
            <hstack height="96px" width="100%" gap="medium">
              <Plate index={0} />
              <Plate index={1} />
            </hstack>
            <hstack height="96px" width="100%" gap="medium">
              <Plate index={2} />
              <Plate index={3} />
            </hstack>
            <hstack>
              <button icon="refresh" size="small" onPress={() => {
                setTouches([])
                reset()
              }}>Review</button>
              <spacer grow />
              <LeaderBtn />
            </hstack>
          </vstack>
          {started || <vstack height="100%" width="100%" alignment="middle center">
            <vstack backgroundColor="neutral-background-strong" cornerRadius="small" padding="small" gap="small"><text size="large">Mimic the Color Pattern !</text>
              <button onPress={() => {
                setStarted(true)
                reset(-1)
                playback.start()
              }}>Start</button>
            </vstack>
          </vstack>}
        </zstack>
      )
    }

    const Best = () => {
      return (
        <vstack alignment="middle center" gap="medium">
          <icon color="caution-plain" name="contest" size="large" />
          <text>You are the BEST !</text>
          <text weight="bold" size="xxlarge">{leader}</text>
          <text>Score: {memory.length}</text>
          <LeaderBtn />
        </vstack>
      )
    }

    const playback = useInterval(() => {
      if (game) {
        highlight(false)
      } else {
        playbackMemory()
      }
    }, 250)

    return (
      <hstack height="100%" backgroundColor={bg}>
        <spacer grow />
        {tab === 0
          ? (leader === userName
            ? <Best />
            : <Game />)
          : <Leaderboard />}
        <spacer grow />
      </hstack>
    )
  }
})

export default Devvit;

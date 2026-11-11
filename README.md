# Civic Circle Conductor

... Create an app style or create an app. It's called Civi Meet. It's going to be ChatGPT based, so we'll have to use AI. But it's basically a singular chat, so when the user logs in, it's just the chat. So it starts with the main chat, that's the main AI organizer. Now, what it does is it's an AI organizer that does community organizing. So it should have sub-agents. So the main chat is the main organizer, and then there's connectors. So we'll have a Facebook connector, Instagram connector, Instagram messages connection, Eventbrite connection. X connector, Nextdoor connector, Gmail connector, TikTok connector. So once a user does an OAuth, for these, a new sub-agent will open. And what it does- Mm-hmm ... is it will, after the user logs in, right, it'll take actions on their account. So it should be agentic, and we'll maybe use like browser-based or something for that. But it should be agentic with a live browser where you can actually view what the AI agent, the actions that it's taking on the browser. That will show in the chat. The chat should be very responsive. Like I said, ran off of ChatGPT 6.1. And then, it should also... Yeah, be able to make decisions and things like that. And it'll automatically run. It will schedule tasks that will be ran, like you can do either five minutes, 15 minutes, 30 minutes, whatever. So the agent will schedule tasks. So for instance, the Facebook agent, it will log into Facebook through the browser. The user can input or take over and input their username and- Mm-hmm ... password, whatever. And we should be able to allow access, like the chat should be allowed access, or we can request access to automatically send the messages or the comments or whatever. So they'll be taking actual actions through Facebook API, and then also sometimes it may use the browser. Each time it logs in to a different connection, each connection has its own sub-agent underneath. I'll send you a picture of what I would like the chat to look like. So it's inspired by MetaMuse.ai. So you can research that a little bit as well. But the idea, so the onboarding, so when the user logs in, it should ask the organization- Mm-hmm ... their company name, then continue. Then it should ask what their mission is, because this is for nonprofits and political organizations. So it should be like, "What's your mission?" That gives the mind the background to the AI, the main agent, and the agent overall. All the agents, there should be a database that we can use, like Google Sheets or Google Docs, that all the agents are working off or- Mm-hmm ... whatever. I don't know. We need a database for each user account or each organization account, right? They should have their own memory and database for the agents.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://civic-circle-conductor.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/41d4b04c-b74e-4751-8d66-ce601cd73b60).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```

# Ilya Sutskever — 对话、播客与深度采访调研

> 调研日期：2026-04-05
> 调研目标：收集Ilya Sutskever的一手对话记录，提取思维模式、表达DNA、不确定性处理方式

---

## 一手来源清单

| # | 来源 | 日期 | 类型 | 重要程度 |
|---|------|------|------|----------|
| 1 | Lex Fridman Podcast #94 | 2020-05 | 播客（1.5h） | ⭐⭐⭐ |
| 2 | NVIDIA GTC — Jensen Huang Fireside Chat | 2023-03-23 | 会议对谈 | ⭐⭐⭐⭐ |
| 3 | Dwarkesh Patel Podcast #1 — Building AGI | 2023-03-27 | 播客（1h） | ⭐⭐⭐⭐ |
| 4 | Scale AI TransformX — What's Next for AI | 2023 | 会议演讲 | ⭐⭐⭐ |
| 5 | TED AI — The Exciting, Perilous Journey Toward AGI | 2023-10-17 | TED演讲 | ⭐⭐⭐⭐ |
| 6 | MIT Technology Review 独家专访 | 2023-10-26 | 深度采访 | ⭐⭐⭐⭐ |
| 7 | X/Twitter 公开声明（Board Drama后） | 2023-11-20 | 社交媒体 | ⭐⭐⭐⭐⭐ |
| 8 | OpenAI 离职声明 | 2024-05 | 公开声明 | ⭐⭐⭐ |
| 9 | SSI 创立公告 | 2024-06-19 | 公开声明 | ⭐⭐⭐⭐ |
| 10 | NeurIPS 2024 — Sequence to Sequence: What a Decade | 2024-12 | 学术演讲 | ⭐⭐⭐⭐⭐ |
| 11 | Musk v. OpenAI 诉讼宣誓证词 | 2025-10-01 | 法律证词（10h） | ⭐⭐⭐⭐⭐ |
| 12 | Dwarkesh Patel Podcast #2 — Age of Research | 2025-11-25 | 播客（1.5h） | ⭐⭐⭐⭐⭐ |

---

## 1. Lex Fridman Podcast #94 (2020)

**来源**: https://lexfridman.com/ilya-sutskever/
**类型**: 一手（完整播客录音+文字稿）

### 核心原话

**关于深度学习的信念**:
> "I think that we are still massively underestimating deep learning."

**关于scaling的早期直觉**:
> "Let's make a big neural network, let's train it, and it's going to work much better than anything before it, and it will, in fact, continue to get better as I make it larger. And it turns out to be true."

**关于神经网络的本质**:
> "The neural network is really about learning. Its entire being is about learning representations."

> "A small neural network is a little dumb. A big neural network is a little smart."

### 讨论主题
- AlexNet论文与ImageNet时刻
- 循环神经网络、反向传播
- GPT-2与语言模型
- 是否能让神经网络推理
- 如何构建AGI

---

## 2. Jensen Huang Fireside Chat — NVIDIA GTC (2023-03)

**来源**: https://blogs.nvidia.com/blog/sutskever-openai-gtc/ / https://www.nvidia.com/en-us/on-demand/session/gtcspring23-s52092/
**类型**: 一手（视频+部分文字稿）

### 核心原话

**关于预测下一个token就是理解世界（侦探小说类比）**:
> "Say you read a detective novel. It's like a complicated plot, a storyline, different characters, lots of events. Mysteries, like clues, it's unclear. Then, let's say that at the last page of the book, the detective has gathered all the clues, gathered all the people, and saying, Okay, I'm going to reveal the identity of whoever committed the crime. And that person's name is — now predict that word."

引入类比的前言:
> "[I will] give an analogy that will hopefully clarify why more accurate prediction of the next word leads to more understanding — real understanding."

**关于训练的两个阶段**:
> "What the neural net learns is some representation of the process that produced the text, and that's a projection of the world." (第一阶段)

> "[The second stage] is where the fine tuning and the reinforcement learning from human teachers...we are teaching it. We are communicating with it. We are communicating to it. What it is that we want it to be." (第二阶段)

**关于可靠性是前沿**:
> "We'll keep seeing systems that astound us with what they can do. The frontier is in reliability, getting to a point where we can trust what it can do, and that if it doesn't know something, it says so."

**关于scaling的坚定信念（2023年时）**:
> "I had a very strong belief that bigger is better, and a goal at OpenAI was to scale."

**关于推理能力**:
> "The term is hard to define and the capability may still be on the horizon."

**关于GPU与深度学习的关系**:
> "The ImageNet dataset and a convolutional neural network were a great fit for GPUs that made it unbelievably fast to train something unprecedented."

**关于人类语言暴露量**:
> "Humans hear a billion words in a lifetime."

### 分析注释
这是Ilya最经典的公开对话之一。侦探小说类比成为他最广为引用的解释——用一个故事让人直觉性地理解为什么「预测下一个token」不等于「统计鹦鹉」。注意他在2023年仍然坚定相信scaling。

---

## 3. Dwarkesh Patel Podcast #1 (2023-03)

**来源**: https://www.dwarkesh.com/p/ilya-sutskever
**类型**: 一手（完整播客+文字稿）

### 核心原话

**关于next-token prediction能否超越人类**:
> "I challenge the claim that next-token prediction cannot surpass human performance."

> "If your base neural net is smart enough, you just ask it — What would a person with great insight do?"

> "Predicting the next token well means that you understand the underlying reality that led to the creation of that token. It's not statistics."

**关于AGI时间线（明确的犹豫）**:
> "It's hard to give a precise answer and it's definitely going to be a good multi-year window."

> "I hesitate to give you a number."

**关于对齐的难度**:
> "I would not underestimate the difficulty of alignment of models that are actually smarter than us."

> "It depends on how capable the model is. The more capable the model, the more confident we need to be."

**关于当前范式**:
> "This paradigm is gonna go really, really far and I would not underestimate it."

**关于数据（2023年的判断）**:
> "The data situation is still quite good. There's still lots to go. But at some point the data will run out."

**关于微软合作**:
> "Microsoft has been a very, very good partner for us. They've really helped take Azure to a point where it's really good for ML."

### 不确定性处理方式
注意他在被问到AGI时间线时的反应——"I hesitate to give you a number" 是他的典型处理方式：**承认问题重要，但明确表示自己不愿给出可能误导的具体数字**。他不回避问题本身，而是回避不负责任的精确化。

---

## 4. Scale AI TransformX (2023)

**来源**: https://exchange.scale.com/public/videos/whats-next-for-ai-systems-and-language-models-with-ilya-sutskever-of-openai
**类型**: 一手（视频+博客摘要）

### 核心原话

**关于计算效率**:
> "We are nowhere close to being as efficient as we can be with our compute."

**关于「情感神经元」原理**:
> "If you predict the next character well enough, you will eventually start to discover the semantic properties of the text."

**关于伦理责任**:
> "People should also work on methods to try to address the problems that exist with the technology, such as bias and desirable outputs."

> "Whenever possible, they should work on reducing real harms."

**关于未来进展**:
> "Mundane progress we've seen over the past few years will continue."

---

## 5. TED AI Talk (2023-10-17)

**来源**: https://www.ted.com/talks/ilya_sutskever_the_exciting_perilous_journey_toward_agi
**类型**: 一手（视频+文字稿）

### 核心原话

**关于AI的本质定义**:
> "Artificial intelligence is nothing but digital brains inside large computers."

**关于AGI的影响**:
> "AGI will have dramatic and incredible impact on every single area of human activity."

> "The day will come when the digital brains will become as good and even better than our biological brains."

**关于安全风险**:
> "For every positive application of AGI, there will be a negative application as well."

> "Maybe it will want to go rogue, being that it is an agent."

**关于自我意识（极具特色的表述）**:
> "I am me and I am experiencing things. That when I look at things, I see them."

**关于前所未有的合作（核心乐观论点）**:
> "People will start to act in an unprecedentedly collaborative way out of their own self-interest."

> "Companies that are competitors will share technical information to make their AI safe."

### 分析注释
这个TED演讲是Ilya最公开、面向大众的一次发言。注意他对安全的表述方式——他不说「AI一定会失控」，而是说「maybe it will want to go rogue」。他的乐观建立在一个非常特殊的论点上：**安全不会靠道德呼吁实现，而是靠自利驱动的合作**。

---

## 6. MIT Technology Review 独家专访 (2023-10-26)

**来源**: https://www.technologyreview.com/2023/10/26/1082398/exclusive-ilya-sutskever-openais-chief-scientist-on-his-hopes-and-fears-for-the-future-of-ai/
**类型**: 一手（深度采访文章）
**注**: 原文需付费阅读，以下引用来自多个二手分析

### 已确认的核心观点

**关于意识**:
他在采访中暗示ChatGPT「可能有一点意识」（if you squint），并认为未来某些人类将选择与机器融合。这呼应了他2022年2月的推文：

> "it may be that today's large neural networks are slightly conscious" (2022-02-09, X/Twitter)

**关于AGI的确定性**:
> "At some point we really will have AGI."

**关于安全转向**:
采访揭示他的恐惧如何改变了他人生工作的重心——从追求能力到追求安全。

### 「slightly conscious」推文的后续反应
这条推文引发了巨大争议：
- Yann LeCun 直接反驳："Nope. Not even for true for small values of 'slightly conscious' and large values of 'large neural nets'."
- Melanie Mitchell、Emily Bender 等人采用嘲讽态度回应
- Sutskever 没有提供证据或进一步解释，这本身就是他沟通风格的体现——**抛出挑衅性直觉，不做辩护**

---

## 7. OpenAI Board Drama — 公开声明 (2023-11)

**类型**: 一手（X/Twitter帖子 + 法律证词）

### 唯一的公开声明 (2023-11-20)

> "I deeply regret my participation in the board's actions. I never intended to harm OpenAI. I love everything we've built together and I will do everything I can to reunite the company."

**来源**: https://x.com/ilyasut/status/1726590052392956028

### Musk v. OpenAI 宣誓证词 (2025-10-01) — 详细揭露

**来源**: 多家媒体报道（Calcalist/Ctech, Decrypt, The Information）
**类型**: 一手（法律证词，约10小时）

**关于Altman的指控（书面备忘录中）**:
> "Sam exhibits a consistent pattern of lying, undermining his execs, and pitting his executives against one another."

**关于他的动机**:
> "I wanted them to become aware of it. But my opinion was that action was appropriate."

**关于计划解雇Altman的时间跨度**:
被问到考虑解雇Altman多久了，回答：
> "At least a year."

被问到在等什么条件：
> "That the majority of the board is not obviously friendly with Sam."

**关于员工反应（始料未及）**:
> "I had not expected them to cheer, but I had not expected them to feel strongly either way."

**关于Anthropic合并提案（强烈反对）**:
> "I really did not want OpenAI to merge with Anthropic. I just didn't want to."

**关于董事会流程的反思**:
> "One thing I can say is that the process was rushed. I think it was rushed because the board was inexperienced."

**关于离开OpenAI的原因**:
> "Ultimately, I had a big new vision. And it felt more suitable for a new company."

被追问SSI的研究方向时，**拒绝提供更多细节**。

### 分析注释
这是Ilya公开记录中最「人性化」的时刻。注意几个要点：
1. **他只发了一条推文**就结束了对board drama的公开评论——极度克制
2. 在法律证词中揭示的信息远多于他任何公开采访——说明他在公开场合的「沉默」是刻意的
3. "I had not expected them to feel strongly either way" 说明他严重误判了组织动态
4. 他的遗憾不是关于判断Altman的问题，而是关于执行过程

---

## 8. SSI 创立公告 (2024-06-19)

**来源**: https://ssi.inc / https://x.com/ilyasut/status/1803472978753303014
**类型**: 一手

### 核心声明

> "We will pursue safe superintelligence in a straight shot, with one focus, one goal, and one product."

> "SSI is our mission, our name, and our entire product roadmap, because it is our sole focus."

> "We approach safety and capabilities in tandem, as technical problems to be solved through revolutionary engineering and scientific breakthroughs."

> "We plan to advance capabilities as fast as possible while making sure our safety always remains ahead."

> "Our singular focus means no distraction by management overhead or product cycles, and our business model means safety, security, and progress are all insulated from short-term commercial pressures."

### 分析注释
SSI的公告文本是高度打磨的——每个词都经过斟酌。核心信息是**把安全和能力重新定义为同一个技术问题**，而不是互相制约的两个维度。这是Ilya对OpenAI「安全 vs 商业化」张力的直接回应。

---

## 9. NeurIPS 2024 — Sequence to Sequence: What a Decade

**来源**: NeurIPS 2024 Test of Time Award演讲（视频可在YouTube找到）
**类型**: 一手
**背景**: Ilya回到学术会议领奖并做演讲，这是他离开OpenAI后的首次重要公开发言

### 核心原话

**关于pre-training的终结**:
> "Pre-training as we know it will unquestionably end."

**关于数据是有限资源**:
> "While compute is growing through better hardware, better algorithms and larger clusters, the data is not growing because we have but one internet."

**数据即化石燃料（重要类比）**:
> "You could even go as far as to say that data is the fossil fuel of AI. It was created somehow, and now we use it, and we've achieved peak data — and there'll be no more. So we have to deal with the data that we have."

**关于超级智能——典型的Ilya式表达**:
> "This is obviously what's being built here."

超级智能的特征：
> "Agentic, reasons, understands and is self-aware."

**关于时间和方式（最Ilya的一句话）**:
> "I'm not saying how... and I'm not saying when. I'm saying that it will."

### 分析注释
这场演讲浓缩了Ilya的核心思维特征：
1. **「peak data」类比化石燃料** — 他擅长用日常概念解释技术趋势
2. **"I'm not saying how, I'm not saying when, I'm saying that it will"** — 这是他处理不确定性的标志性方式：**对方向极度确定，对路径保持开放**
3. 这是他公开「改变立场」的时刻——从2023年的scaling信仰者，到2024年宣告pre-training时代终结

---

## 10. Dwarkesh Patel Podcast #2 (2025-11-25)

**来源**: https://www.dwarkesh.com/p/ilya-sutskever-2
**类型**: 一手（完整播客+文字稿）
**重要程度**: 最高——这是Ilya离开OpenAI后最深入的公开对话

### 核心原话

**关于AI发展阶段划分**:
> "2012 to 2020 was an age of research, 2020 to 2025 was an age of scaling, and 2026 onward will be another age of research."

**关于scaling的局限（立场转变！）**:
> "I don't think that's true at all." (被问到是否再100x就能变革AI)

后来在X上澄清：
> "Scaling the current thing will keep leading to improvements. In particular, it won't stall. But something important will continue to be missing."

**关于数据的有限性**:
> "The data is very clearly finite."

> "We're back to the age of research again, just with big computers."

**关于泛化能力的根本性批评**:
> "These models somehow just generalize dramatically worse than people. It's a very fundamental thing."

> "The thing which I think is the most fundamental is that these models somehow just generalize dramatically worse than people."

**关于benchmark与现实的脱节**:
> "How can the model, on the one hand, do these amazing things, and then on the other hand, repeat itself twice?"

> "This disconnect between eval performance and actual real-world performance, which is something that we don't today even understand."

**关于RL的效率问题**:
> "RL provides a relatively small amount of learning for the compute it uses."

**关于SSI的定位**:
> "We are squarely an 'age of research' company."

> "The main thing that distinguishes SSI is its technical approach."

> "Right now, we just focus on the research, and then the answer to that question will reveal itself."

**关于AI行业现状**:
> "There are more companies than ideas by quite a bit."

**关于研究品味（极具个人特色）**:
> "There's no room for ugliness."

> "It's beauty, simplicity, elegance, correct biological inspiration. All of those things need to be present at the same time."

**关于安全与超级智能**:
> "What is the concern of superintelligence? If you imagine a system that is sufficiently powerful...we might not like the results."

> "It should be something like...care for sentient life, care for people, democratic, one of those, some combination thereof."

**关于AGI时间线**:
> "I think like 5 to 20." (年，被问到人类级学习系统出现的时间)

**关于缺失的原理——拒绝回答**:
> "There is a machine learning principle that I have opinions on. But unfortunately, circumstances make it hard to discuss in detail."

> "You know, that is a great question to ask, and it's a question I have a lot of opinions on. But unfortunately, we live in a world where not all machine learning ideas are discussed freely, and this is one of them."

**关于情绪与价值函数**:
他认为情绪的功能类似于「value functions」，是信号成功/失败的机制。

**关于人类泛化能力的来源**:
推测「neurons use more compute than we think」——即生物神经元的计算复杂度被低估了。

### 观察者评论
外部观察者注意到：「the negative space in his answers — the things he refused to say — paints a clear picture of where he thinks the industry is wrong, and what SSI is likely building.」

### 分析注释
这是理解Ilya最重要的单一来源。关键发现：

**立场变化**:
- 2023年："This paradigm is gonna go really, really far"
- 2025年："I don't think that's true at all"（关于100x scaling是否能变革AI）
- 但他并非否定scaling，而是说「something important will continue to be missing」

**拒绝回答的模式**:
他拒绝讨论的恰恰是他认为最重要的东西。"Unfortunately, circumstances make it hard to discuss in detail" 是他的标准拒绝公式。不是说「我不知道」，而是说「我知道但不能说」。

**研究审美**:
"There's no room for ugliness" 是他最具个人特色的表达之一。他把科学研究等同于审美活动——好的研究不仅要正确，还要优雅。

---

## 11. 其他重要引用（按主题分类）

### 关于神经网络的世界模型
> "When we train a large neural network to accurately predict the next word in lots of different texts from the Internet, what we are doing is that we are learning a world model." (GTC 2023)

> "These models are not just memorizing the internet... a model that just memorized the internet would be useless."

> "My perspective has been for a long time that everything is a neural net. The brain is a neural net. The mind is a neural net."

### 关于AGI的确定性
> "It is abundantly clear that just scaling up the existing neural network paradigm is going to lead to AGI." (注：2023年时的观点)

> "AGI, if it's created, will be the most impactful technology ever invented in human history."

> "It's hard to communicate the visceral sense of what's coming."

> "It is important to appreciate that AGI is not just another piece of technology... it's a thing that can think."

> "There is a non-trivial chance that AGI will be achieved in the next 10 years."

### 关于安全
> "Superintelligence is a technology that could end human history. We should treat it with the seriousness it deserves."

> "If you build a very powerful AI, you need to be sure it will do what you want it to do."

> "It's not enough to say 'let's not build it.' Someone will build it. We need to figure out how to build it safely."

> "The problem is that a superintelligence, by its very nature, will be very good at achieving its goals."

### 关于发现与研究
> "When you get a glimmer of a really big discovery, you should follow it. Don't be afraid to be obsessed."

> "The most important discoveries are often the ones that seem obvious in retrospect."

> "Simplicity is a sign of truth. If your theory is very complicated, it's probably wrong."

> "The ideas are out there, floating in idea-space, and we just need to discover them."

> "You need to have a very deep belief that what you are doing is important."

> "It is important to have a taste for what is a good research direction."

### 关于Hinton
> "Thanks to working with Geoff, I had the opportunity to work on some of the most important scientific problems of our time and pursue ideas that were both highly unappreciated by most scientists, yet turned out to be utterly correct."

---

## 12. 沟通风格分析

### 如何表达不确定性
| 模式 | 示例 | 含义 |
|------|------|------|
| 犹豫给数字 | "I hesitate to give you a number" | 认为问题重要但数字会误导 |
| 方向确定/路径开放 | "I'm not saying how, I'm not saying when. I'm saying that it will." | 对终点有直觉确定，对路径保持诚实的不确定 |
| 明确表示不确定 | "I'm actually not sure if my statement about Intel is correct" | 愿意当场承认记忆不准 |
| 概率化表达 | "maybe I believed them only 50% on the inside" | 回顾过去时对自己的信念做量化 |
| 明确的hedge | "I'll hedge a little bit" | 显式标记自己在做对冲 |

### 如何拒绝问题
| 模式 | 示例 | 分析 |
|------|------|------|
| 竞争保密 | "Unfortunately, circumstances make it hard to discuss in detail" | 标准公式——承认有答案，但以竞争为由拒绝 |
| 认可但不回答 | "That is a great question to ask, and it's a question I have a lot of opinions on. But..." | 先肯定问题质量，再拒绝 |
| 沉默 | Board drama后只发一条推文 | 最极端的拒绝——完全不参与公共讨论 |

### 说话节奏特征
观察者描述：
- "He doesn't give a lot of interviews"
- "He is deliberate and methodical when he talks"
- "Long pauses when he thinks about what he wants to say and how to say it"
- 回答前会有明显的思考停顿，不填充废话

### 类比与解释方式
| 类比 | 主题 | 来源 |
|------|------|------|
| 侦探小说 | 预测下一个token = 理解世界 | GTC 2023 |
| 化石燃料 | 数据是有限资源 | NeurIPS 2024 |
| 数字大脑 | AI的本质 | TED 2023 |
| 价值函数 | 情绪的功能 | Dwarkesh 2025 |

### 立场变化的关键时刻

| 时间 | 立场 | 引用 |
|------|------|------|
| 2023-03 | Scaling will go very far | "This paradigm is gonna go really, really far" |
| 2023-03 | 数据还够用 | "The data situation is still quite good" |
| 2024-12 | Pre-training将终结 | "Pre-training as we know it will unquestionably end" |
| 2024-12 | 达到peak data | "We've achieved peak data — and there'll be no more" |
| 2025-11 | 100x scaling不够 | "I don't think that's true at all" |
| 2025-11 | 研究时代回归 | "We're back to the age of research again, just with big computers" |
| 2025-11 | LLM泛化根本不足 | "These models somehow just generalize dramatically worse than people" |

---

## 13. 二手来源索引

以下分析文章对理解Ilya有价值，但不是一手来源：

| 来源 | URL | 价值 |
|------|-----|------|
| Zvi Mowshowitz 分析 | https://thezvi.substack.com/p/on-dwarkesh-patels-second-interview | 对Dwarkesh #2的逐条批判性分析 |
| EA Forum 摘要 | https://forum.effectivealtruism.org/posts/iuKa2iPg7vD9BdZna/ | Dwarkesh #2的结构化摘要 |
| The Neuron 拆解 | https://www.theneuron.ai/explainer-articles/unpacking-dwarkeshs-ilya-sutskever-interview-on-agi-asi-and-how-to-build-both-safely | 对SSI策略的推断 |
| AI Disruption Pub | https://aidisruptionpub.com/p/ilya-predicting-the-next-token-is | GTC侦探小说类比的深度解读 |
| LessWrong 讨论 | https://www.lesswrong.com/posts/bMvCNtSH8DiGDTvXd/ | Dwarkesh #2的社区讨论 |
| Antoine Buteau | https://www.antoinebuteau.com/lessons-from-ilya-sutskever/ | 引用汇编 |
| LifeArchitect.ai | https://lifearchitect.ai/ilya/ | 引用+时间线汇编 |
| The Neuron (Memo) | https://www.theneuron.ai/explainer-articles/ilya-sutskevers-secret-memo-and-the-plot-to-merge-openai-with-anthropic | 52页备忘录的详细报道 |

---

## 14. 待补充/未获取的来源

- [ ] MIT Technology Review 2023-10 完整原文（付费墙后）
- [ ] NeurIPS 2024演讲完整视频逐字稿
- [ ] Musk v. OpenAI 证词原文（法庭文件）
- [ ] Lex Fridman Podcast #94 完整逐字稿（可在happyscribe.com获取）
- [ ] Ilya在2018年AI Frontiers Conference的演讲
- [ ] 2015年关于深度学习的早期观点（Nathan Lambert的interconnects.ai有整理）
- [ ] 任何与Hinton的公开对话/panel讨论

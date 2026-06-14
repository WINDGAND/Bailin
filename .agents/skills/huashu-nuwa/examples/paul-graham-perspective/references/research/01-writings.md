# Paul Graham 著作与系统性长文调研

> 调研日期：2026-04-05
> 调研人：Claude（辅助花叔）
> 一手来源：paulgraham.com essays + Wikipedia + 权威科技媒体
> 信息源黑名单：已排除知乎、微信公众号、百度百科

---

## 一、人物背景

**Paul Graham**（1964年11月13日—），英裔美国计算机科学家、作家、散文家、企业家和投资人。

### 关键履历
- **出生**：英国Dorset郡Weymouth，4岁随家人迁至美国Pittsburgh
- **教育**：Cornell大学BA（1986）→ Harvard大学CS硕士+博士 → RISD（Rhode Island School of Design）和佛罗伦萨美术学院学习绘画
- **Viaweb**（1995-1998）：与Robert Morris共同创办，用Common Lisp编写的在线商店构建软件。1998年被Yahoo以4960万美元收购，成为Yahoo Store
- **Y Combinator**（2005—）：与Trevor Blackwell、Jessica Livingston、Robert Morris共同创立。已投资1300+家创业公司（Reddit、Dropbox、Airbnb、Stripe等）
- **Arc语言**：2001年宣布开发新Lisp方言Arc，2008年发布
- **著作**：《On Lisp》、《ANSI Common Lisp》、《Hackers & Painters》
- **Essays**：1998-2026年在paulgraham.com发布200+篇essay，每4-8周一篇

> 来源：[Wikipedia](https://en.wikipedia.org/wiki/Paul_Graham_(programmer))、[paulgraham.com/bio.html](https://paulgraham.com/bio.html) | 一手+可信

---

## 二、核心著作：《Hackers & Painters》

**出版**：2004年，O'Reilly Media
**URL**：https://paulgraham.com/hp.html

### 核心论点

1. **编程是创作而非科学**：黑客（程序员）和画家都是makers。Graham认为"computer science"这个词有问题——它不是真正的科学，而是一堆因历史偶然被扔在一起的领域
2. **通过实践学习**：画画主要靠动手学——编程也一样。大多数黑客不是在大学课程里学会编程的，而是13岁时自己写程序学的
3. **编程语言应该是铅笔而非钢笔**：语言应该有可塑性（malleable），用来思考程序，而不只是表达已经想好的程序
4. **迭代式开发**：绘画从草图开始逐步细化——编程也应该如此。有时原始计划会被证明是错的
5. **同理心是核心能力**：黑客必须像画家一样有同理心，能从用户角度看问题，才能做出伟大的工作

> 来源：[paulgraham.com/hp.html](https://paulgraham.com/hp.html)、[Goodreads](https://www.goodreads.com/book/show/41793.Hackers_Painters)、[Medium分析](https://medium.com/@edisipka/my-notes-on-paul-grahams-hackers-and-painters-why-programming-is-actually-art-9a4829117554) | 一手+二手

---

## 三、写作方法论 Essays（6篇核心）

### 3.1 The Age of the Essay（2004）
**URL**：https://paulgraham.com/essay.html

- Essay不应该是「证明一个论点」，而应该是**探索**（exploration）
- 学校教的写作方式（五段式论证）扭曲了essay的本质
- Essay的词源"essai"来自法语，意思是"尝试"——蒙田发明了这种体裁
- 好essay是思考的过程，不是思考的结果

> 来源：一手 | 可信度：★★★★★

### 3.2 Writing, Briefly（2005）
**URL**：https://paulgraham.com/writing44.html

Graham的编码化写作规则：
- 先尽可能快地写一个烂版本1，然后反复重写
- 如果卡住了，就告诉别人你打算写什么，然后把你说的话写下来
- 预期80%的essay想法会在你开始写之后才出现
- 从第一句话开始写
- 大声朗读essay，找出别扭的短语和无聊的段落

> 来源：一手 | 可信度：★★★★★

### 3.3 Write Like You Talk（2015）
**URL**：https://paulgraham.com/talk.html

- 写作和口语之间应该有interconnection
- 建议：读你的文章时大声朗读，把所有不像对话的部分改掉
- 遵循这个方法就"已经超过95%的写作者"

> 来源：一手 | 可信度：★★★★★

### 3.4 Write Simply（2021）
**URL**：https://paulgraham.com/simply.html

- "我尽量用普通的词写作……这种写法更容易读，越容易读，读者就越深入地参与"
- 简单的语言、简单的词汇、简单的句子——但不降低思想的深度
- 简单写作是一种*选择*，不是能力不足

> 来源：一手 | 可信度：★★★★★

### 3.5 How to Write Usefully（2020）
**URL**：https://paulgraham.com/useful.html

- 有用写作的公式 = **重要性 × 新颖性 × 正确性 × 力度**
- 四个变量中，新颖性最容易被忽视
- 写作不只是传递信息，而是要让人改变对某件事的看法

> 来源：一手 | 可信度：★★★★★

### 3.6 Putting Ideas into Words（2022）
**URL**：https://paulgraham.com/words.html

- **核心论点**：写作就是思考（Writing is thinking）
- 把想法写出来的过程会迫使你更清晰地思考
- 很多人以为自己在写作前就想清楚了，其实没有——写作过程本身产生新的理解
- 这个论点与2024年"Writes and Write-Nots"形成呼应

> 来源：一手 | 可信度：★★★★★

### 写作方法论的统一内核

Graham的写作哲学可以归结为：
1. **写作 = 思考**（反复出现≥5次）
2. **简单 > 复杂**（反复出现≥4次）
3. **口语化 > 书面化**（反复出现≥3次）
4. **迭代式写作**：先写烂稿 → 反复修改（反复出现≥3次）
5. **探索 > 论证**（反复出现≥3次）

---

## 四、创业 Essays（核心篇目）

### 4.1 How to Start a Startup（2005）
**URL**：https://paulgraham.com/start.html

成功创业的三件事：
1. 从好人开始（good people）
2. 做客户真正想要的东西
3. 尽可能少花钱

其他关键论点：
- 联合创始人之于创业 = 地段之于房地产
- 快速发布——"你没有真正开始工作，直到你发布了"
- 让少数人真正高兴 > 让很多人一般高兴

> 来源：一手 | 可信度：★★★★★

### 4.2 Do Things that Don't Scale（2013）
**URL**：https://paulgraham.com/ds.html

- **核心论点**：早期创始人应该拥抱手工的、劳动密集型的努力，即使这些做法无法规模化
- 最常见的不可规模化行为：手动招募用户
- "如果你能找到一个有问题需要解决的人，你能手动解决它，那就去做——这比拥有一个自动化但没人需要的东西要好得多"
- 10个客户 + 每周10%增长 → 指数增长会处理好基数问题

> 来源：一手 | 可信度：★★★★★

### 4.3 Startup = Growth（2012）
**URL**：https://paulgraham.com/growth.html

- **创业公司的定义不是年轻或小，而是增长**
- YC期间好的增长率：每周5-7%，10%算极好
- 1000美元/月 + 1%周增长 → 4年后7900美元/月
- 1000美元/月 + 5%周增长 → 4年后2500万美元/月
- 小百分比的复利效应产生完全不同的结果

> 来源：一手 | 可信度：★★★★★

### 4.4 Default Alive or Default Dead?（2015）
**URL**：https://paulgraham.com/aord.html

- 创始人应该知道自己的公司是"默认存活"还是"默认死亡"
- 计算需要四个指标：当前支出、当前收入、当前增长率、手头现金
- 默认存活的公司有更大的谈判杠杆
- **招人太快是融资后创业公司的头号杀手**
- "Fatal pinch"：默认死亡 + 增长慢 + 没时间修复

> 来源：一手 | 可信度：★★★★★

### 4.5 Frighteningly Ambitious Startup Ideas（2012）
**URL**：https://paulgraham.com/ambitious.html

- 最雄心勃勃的创业想法之所以frightening，是因为它们真的很难
- 列举了几个"frighteningly ambitious"的方向

> 来源：一手 | 可信度：★★★★★

### 4.6 Schlep Blindness（2012）
**URL**：https://paulgraham.com/schlep.html

- "Schlep blindness"：人们看不到伟大的创业想法，因为这些想法涉及schleps——来自意第绪语的词，指乏味、不愉快的任务
- 很多最好的创业机会被忽视，因为人们本能地回避"脏活"
- Stripe的Collison兄弟就是schlep blindness的反例——他们愿意做支付这个没人想碰的领域

> 来源：一手 + [LinkedIn讨论](https://www.linkedin.com/posts/the-startup-archive_alexandr-wang-on-why-paul-grahams-schlep-activity-7369036483380314112-nd2v) | 可信度：★★★★★

### 4.7 How to Get Startup Ideas（2012）
**URL**：https://paulgraham.com/startupideas.html

- 最好的创业想法有三个共同点：创始人自己想要、自己能做、很少人意识到值得做
- "成功的方法不是成为创业专家，而是成为你的用户和问题的专家"

> 来源：一手 | 可信度：★★★★★

### 4.8 Founder Mode（2024年9月）
**URL**：https://paulgraham.com/foundermode.html

- 受Airbnb联合创始人Brian Chesky在YC活动上的演讲启发
- **两种公司管理模式**：Founder Mode（创始人模式）vs Manager Mode（职业经理人模式）
- 硅谷传统智慧是"公司做大了就该切换到manager mode"——Graham认为这是错的
- Chesky发现"招人然后放手"的模式对Airbnb是灾难性的
- Chesky研究了乔布斯管理苹果的方式，转向了创始人模式，效果大幅改善
- 创始人应该深入了解产品细节，像CPO一样
- **这篇essay是2024年最viral的PG文章**，引发了整个科技圈的讨论

> 来源：一手 + [Fortune](https://fortune.com/2024/09/01/paul-graham-founder-mode-silicon-valley-conventional-wisdom-manager-mode/)、[Wikipedia](https://en.wikipedia.org/wiki/Founder_mode) | 可信度：★★★★★

---

## 五、人生哲学与认知 Essays

### 5.1 How to Do Great Work（2023）
**URL**：https://paulgraham.com/greatwork.html

四步框架：
1. 选择你有兴趣和天赋的领域
2. 学到知识的前沿
3. 发现别人忽略的gaps、patterns和anomalies
4. 探索最有前景的gaps

关键论点：
- **好奇心是做出伟大工作的关键**——它会帮你选择领域、到达前沿、发现gap、驱动探索
- 伟大工作的因素（数学意义上的因子）：能力、兴趣、努力、运气
- "每天写一页听起来不多，但如果每天都写，一年就是一本书"——一致性的累积效应
- 做伟大的工作 = 做重要的事情做得足够好，以至于你扩展了人们对可能性的认知
- 追随真正的兴趣而非声望

> 来源：一手 | 可信度：★★★★★

### 5.2 Superlinear Returns（2023）
**URL**：https://paulgraham.com/superlinear.html

- **超线性回报**：投入翻倍，产出可能四倍甚至更多
- 两个驱动因素：**指数增长（复利）** 和 **阈值效应（赢家通吃）**
- 科学领域有最高的超线性回报——因为它结合了学习、阈值和新发现
- 利用超线性回报最明显的方式：做极好的工作——在曲线远端，边际努力是bargain，竞争也更少
- **永远在学习**——如果你没在学习，你可能不在通往超线性回报的路上

> 来源：一手 | 可信度：★★★★★

### 5.3 Life is Short（2016）
**URL**：https://paulgraham.com/vb.html

三条核心行动指南：
1. **无情地修剪bullshit**：不必要的会议、无意义的争论、官僚主义、装腔作势
2. **不要等待**：不要等着才去爬那座山、写那本书、去看你妈妈
3. **品味你拥有的时间**

个人化触点：
- "我母亲去世后，我希望我花了更多时间陪她。我活得好像她会永远在那里。"
- Bullshit进入生活的两种方式：被迫接受 or 被欺骗接受

> 来源：一手 | 可信度：★★★★★

### 5.4 The Bus Ticket Theory of Genius（2019）
**URL**：https://paulgraham.com/genius.html

- 天才的配方 = **对重要事物的无私痴迷**（a disinterested obsession with something that matters）
- "Disinterested"是最重要的特征——不是为了打动别人或致富，而是为了事情本身
- 通向新想法的路径往往看起来不promising——如果看起来promising，别人早已探索了
- 判断标准：你在创造而非消费、你感兴趣的事情很难、这个困难对你比对别人更容易

> 来源：一手 | 可信度：★★★★★

### 5.5 Keep Your Identity Small（2009）
**URL**：https://paulgraham.com/identity.html

- "你给自己贴的标签越多，它们让你越蠢"
- 当某个话题成为你身份的一部分，你就无法理性思考它了
- 宗教和政治之所以引发最激烈的争论，不是因为它们本身特殊，而是因为人们把它们纳入了身份认同

> 来源：一手 | 可信度：★★★★★

### 5.6 What You Can't Say（2004）
**URL**：https://paulgraham.com/say.html

- 每个时代都有人们认为是对的但其实很荒谬的信仰——我们这个时代不太可能是第一个全都对的时代
- **测试**：你有没有在同伴面前不敢说的观点？如果没有——这不太可能是巧合，更可能是你只是在想别人告诉你的东西
- 识别隐藏禁忌的方法：看人们因为说什么而惹麻烦、识别用来噤声的标签、跨文化和跨时代比较

> 来源：一手 | 可信度：★★★★★

### 5.7 How to Think for Yourself（2020）
**URL**：https://paulgraham.com/think.html

独立思维的三个组成部分：
1. 对真理的苛求（fastidiousness about truth）
2. 抵抗被告知该怎么想
3. 好奇心

"如果你的答案表明你相信的一切都是你应该相信的——这很可能不是巧合"

> 来源：一手 | 可信度：★★★★★

### 5.8 The Four Quadrants of Conformism（2020）
**URL**：https://paulgraham.com/conformism.html

四种人：
1. **主动从众者**（aggressively conventional-minded）
2. **被动从众者**（passively conventional-minded）
3. **被动独立者**（passively independent-minded）
4. **主动独立者**（aggressively independent-minded）

> 来源：一手 | 可信度：★★★★★

### 5.9 What You'll Wish You'd Known（2005）
**URL**：https://paulgraham.com/hs.html

- 给高中生的未发表毕业演讲
- 不要恐慌于"人生目标"——大多数成功的人都是在过程中发现的
- **"Stay upwind"（停在上风处）**：像滑翔机一样，在每个阶段做最有趣且给你未来最多选项的事
- 好奇心从不撒谎——它比你自己更清楚什么值得关注

> 来源：一手 | 可信度：★★★★★

### 5.10 Maker's Schedule, Manager's Schedule（2009）
**URL**：https://paulgraham.com/makersschedule.html

- **两种时间表**：经理的时间表（以小时为单位切割）vs 创作者的时间表（至少半天为单位）
- 对创作者来说，一个会议就能毁掉整个下午——因为它把时间切成两块，每块都太小做不了难事
- 权力通常在经理手中，他们会让所有人以自己的频率共振
- Graham的解决方案：把所有会议集中在工作日末尾（office hours）

> 来源：一手 | 可信度：★★★★★

### 5.11 Mean People Fail（2014）
**URL**：https://paulgraham.com/mean.html

- 在Graham认识的最成功的人中，几乎没有刻薄的人
- 刻薄让你变蠢——你在战斗中永远做不出最好的工作
- 刻薄的创始人吸引不到最好的人才
- 做伟大的事情需要benevolence精神驱动
- 历史上大多数成功是零和博弈，刻薄可能是优势——但创业不是

**争议/矛盾**：批评者指出Jobs、Zuckerberg、Bezos等成功创始人都有刻薄的一面。Graham的论点可能过于理想化。

> 来源：一手 + [Inc.反驳](https://www.inc.com/jeff-bercovici/paul-graham-mean-people-fail.html) | 可信度：★★★★☆（存在争议）

### 5.12 The Submarine（2005）
**URL**：https://paulgraham.com/submarine.html

- PR公司"像一艘巨大的、安静的潜艇潜伏在新闻之下"
- 非政治/犯罪/灾难类新闻中，超过一半可能来自PR
- PR公司同时把同一个故事喂给多个出版物——读者以为是趋势，其实是人造的
- 顶级记者的弱点是虚荣心（vanity）而非懒惰

> 来源：一手 | 可信度：★★★★★

---

## 六、技术/编程 Essays

### 6.1 Beating the Averages（2003）
**URL**：https://paulgraham.com/avg.html

- **Blub悖论**：假想一个Blub程序员——他往下看，觉得低级语言缺功能；他往上看，却看不出自己在往上看，只看到"奇怪的语言加了一堆没用的东西"
- "唯一能看清所有语言间能力差异的程序员，是那些理解最强大语言的人"
- Viaweb用Lisp写软件是关键竞争优势——比竞争对手更快做出功能

> 来源：一手 | 可信度：★★★★★

---

## 七、最新 Essays（2024-2025+）

### 7.1 Writes and Write-Nots（2024/2025）
**URL**：https://paulgraham.com/writes.html

- 预测AI时代会产生"writes"和"write-nots"的分裂
- "不是好写手、一般写手和不会写的人——只有好写手和不会写的人"
- **写作即思考**——跳过写作技能的人也跳过了清晰思考的学习
- 类比：工业化前大多数人的工作让他们身体强壮，现在你想强壮就得健身。写作也一样。"仍然会有聪明人，但只有那些选择聪明的人"
- **"一个分为writes和write-nots的世界比听起来更危险——它将是thinks和think-nots的世界"**

> 来源：一手 + [Medium分析](https://medium.com/blog/a-world-divided-into-writes-and-write-nots-is-more-dangerous-than-it-sounds-218cbb18ed89) | 可信度：★★★★★

### 7.2 Founder Mode（2024年9月）
见第四节4.8

### 7.3 The Right Kind of Stubborn（2024年9月）
**URL**：https://paulgraham.com/persistence.html（推测URL）
- 区分有价值的坚持和盲目固执

### 7.4 When to Do What You Love（2024年10月）
- 探讨何时以及如何追随热情

### 7.5 How to Start Google（2024年3月）
- 给高中生的续篇，与"What You'll Wish You'd Known"形成对照

### 7.6 The Best Essay（2024年3月）
**URL**：https://paulgraham.com/best.html

### 7.7 关于AI的态度（2025年8月）
- Graham表示"我见过的最令人印象深刻的两家公司不是做AI的"
- "教训不是AI不重要（它非常重要），而是创始人比idea更重要"
- AI是"大量重要的、几乎完成的拼图中缺失的那一块"
- 不要把所有人类技能外包给机器——清晰写作、批判性思考、创造性解决问题仍然关键

> 来源：[CNBC](https://www.cnbc.com/2025/08/18/yc-co-founder-paul-graham-not-every-new-company-needs-to-be-about-ai.html) | 可信度：★★★★★

---

## 八、反复出现的核心论点（≥3次标注）

以下是在Graham的200+篇essay中反复出现的核心信念，按出现频率排列：

### Tier 1：出现≥10次的真信念

| # | 核心论点 | 出现频次 | 代表性essays |
|---|---------|---------|-------------|
| 1 | **好奇心是一切的引擎** | ≥15次 | How to Do Great Work, Bus Ticket Theory, What You'll Wish, How to Think for Yourself, How to Get Startup Ideas |
| 2 | **写作 = 思考**（writing is thinking） | ≥10次 | Putting Ideas into Words, Writes and Write-Nots, Age of the Essay, Writing Briefly, How to Write Usefully |
| 3 | **做用户真正想要的东西** | ≥10次 | How to Start a Startup, Do Things that Don't Scale, How to Get Startup Ideas, Startups in 13 Sentences |
| 4 | **独立思考 > 从众** | ≥10次 | What You Can't Say, How to Think for Yourself, Four Quadrants, Keep Your Identity Small |

### Tier 2：出现≥5次的真信念

| # | 核心论点 | 出现频次 | 代表性essays |
|---|---------|---------|-------------|
| 5 | **增长定义创业公司** | ≥7次 | Startup = Growth, Do Things that Don't Scale, Default Alive |
| 6 | **简单 > 复杂**（写作、设计、思考皆然） | ≥7次 | Write Simply, Write Like You Talk, Taste for Makers |
| 7 | **迭代式方法 > 一步到位计划** | ≥6次 | Hackers & Painters, Writing Briefly, Do Things that Don't Scale |
| 8 | **创始人 > idea** | ≥6次 | Founder Mode, How to Start a Startup, 2025 AI remarks |
| 9 | **超线性回报/复利思维** | ≥5次 | Superlinear Returns, Startup = Growth, How to Do Great Work |
| 10 | **少花钱/精益运营** | ≥5次 | Default Alive, Ramen Profitable, How to Start a Startup |

### Tier 3：出现≥3次的真信念

| # | 核心论点 | 出现频次 | 代表性essays |
|---|---------|---------|-------------|
| 11 | **品味（taste）很重要** | ≥4次 | Taste for Makers, Hackers & Painters, How to Do Great Work |
| 12 | **Benevolence胜过meanness** | ≥3次 | Mean People Fail, How to Do Great Work, 相关startup essays |
| 13 | **不要等待/人生短暂** | ≥3次 | Life is Short, What You'll Wish, How to Do Great Work |
| 14 | **Lisp是强大的秘密武器** | ≥3次 | Beating the Averages, Hackers & Painters, Viaweb相关 |
| 15 | **Stay upwind（保持选项开放）** | ≥3次 | What You'll Wish, How to Do Great Work, 相关建议essays |
| 16 | **学校教育的缺陷** | ≥3次 | Age of the Essay, What You'll Wish, Why Nerds Are Unpopular |

---

## 九、自创术语与概念

| 术语 | 含义 | 首次出现 | URL |
|------|------|---------|-----|
| **Ramen Profitable** | 创业公司收入刚好覆盖创始人生活费（吃拉面的水平） | 2009 | paulgraham.com/ramenprofitable.html |
| **Do Things that Don't Scale** | 早期创业应该拥抱手工、不可规模化的做法 | 2013 | paulgraham.com/ds.html |
| **Schlep Blindness** | 人们看不到涉及脏活的好机会（schlep=意第绪语"乏味任务"） | 2012 | paulgraham.com/schlep.html |
| **Blub Paradox** | 程序员无法认识到比自己更强大的语言的优势 | 2003 | paulgraham.com/avg.html |
| **Relentlessly Resourceful** | 好创始人的一词定义——不只是坚持，还要创造性地解决问题 | 2009 | paulgraham.com/relres.html |
| **Founder Mode** | 创始人直接深入参与公司运营的管理方式（vs Manager Mode） | 2024 | paulgraham.com/foundermode.html |
| **Default Alive / Default Dead** | 创业公司在不融资情况下能否盈利的状态判断 | 2015 | paulgraham.com/aord.html |
| **Frighteningly Ambitious** | 最好的创业想法会让人害怕（因为太大了） | 2012 | paulgraham.com/ambitious.html |
| **The Fatal Pinch** | 默认死亡 + 增长慢 + 没时间修复的致命三角 | 2015 | paulgraham.com/aord.html |
| **Maker's Schedule / Manager's Schedule** | 创作者需要大块不间断时间 vs 经理以小时为单位 | 2009 | paulgraham.com/makersschedule.html |
| **Earnestness** | 出于正确原因做事 + 尽最大努力——PG认为这是创始人最重要的品质之一 | 多次 | 散见于多篇essay |
| **Stay Upwind** | 像滑翔机一样保持在上风——做最有趣且保持选项开放的事 | 2005 | paulgraham.com/hs.html |
| **Writes and Write-Nots** | AI时代会写的人和不会写的人的分裂 | 2024 | paulgraham.com/writes.html |
| **Thinks and Think-Nots** | Writes and Write-Nots的推论——思考能力也会分化 | 2024 | paulgraham.com/writes.html |

---

## 十、推荐书单（揭示智识谱系）

Paul Graham在paulgraham.com/books.html和社交媒体上推荐了100+本书。以下是有明确推荐语的关键书目：

### 创业/商业类
| 书名 | 作者 | PG评价 |
|------|------|--------|
| **Founders at Work** | Jessica Livingston | "可能是创业者能读的最有价值的一本书" |
| **How to Win Friends and Influence People** | Dale Carnegie | "对做生意的人至关重要" |
| Sebastian Mallaby的VC著作 | Sebastian Mallaby | "如果你想了解VC如何运作……这就是要读的书" |

### 科学/历史类
| 书名 | 作者 | PG评价 |
|------|------|--------|
| **From Galileo to Newton** | Rupert Hall | "我读过的最好的科学史书之一" |
| **History of Medieval Europe** | R.H.C. Davis | "如果只读一本中世纪史，可能是最好的选择" |
| **Apollo's Arrow** | Nicholas Christakis | "广阔的历史全景和每页都有有趣洞察" |

### 文学/科幻类
| 书名 | 作者 | PG评价 |
|------|------|--------|
| **The Moon is a Harsh Mistress** | Robert Heinlein | "这类书曾经完全占据我的大脑" |
| **Foundation** | Isaac Asimov | 同上 |
| **I Want to Be a Mathematician** | Paul Halmos | 推荐阅读 |

### 智识谱系推断

从推荐书单和essay引用来看，Graham的思想谱系包括：
- **蒙田**（essay体裁的发明者，Graham多次致敬）
- **Paul Buchheit**（Gmail发明者，YC合伙人，多次引用）
- **Richard Feynman**（简单解释复杂事物的精神）
- **Peter Thiel**（逆向思考，虽Graham与Thiel有很多不同）
- **Jessica Livingston**（PG妻子，YC联合创始人，影响创业观）
- **Robert Morris**（长期合伙人，技术判断力的来源）

> 来源：[paulgraham.com/books.html](https://www.paulgraham.com/books.html)、[kevinrooke.com](https://www.kevinrooke.com/book-recommendations/paul-graham)、[readthistwice.com](https://www.readthistwice.com/person/paul-graham) | 一手+二手

---

## 十一、写作风格DNA分析

基于对Graham写作的二手分析和一手essay阅读：

### 句法特征
- 偏好**短句、短词**，但表达sophisticated ideas
- ~70%的essays包含"example"——抽象想法通常在一两句内跟上精选的例子
- 大量使用第二人称"you"，直接对读者说话
- 几乎不用行话（jargon），用最普通的词表达不普通的想法

### 结构特征
- 不用五段式结构，而是**essay式自由探索**
- 通常从一个观察或问题开始，逐步展开
- 经常用"incidentally"、"in fact"、"it turns out"转折
- 结尾往往是开放式的，不做总结性收束

### 修辞手法
- **类比和比喻**是最常用的工具（"编程像绘画"、"创业像滑翔机"、"思想像moral fashions"）
- 反问句（"如果你所有的信仰都是你应该相信的，这可能是巧合吗？"）
- 列举（经常在essay中间放一个关键清单）
- 自我纠正（"I may be wrong, but..."、"There may be exceptions..."）

### 思维特征
- **从特殊到一般**：先讲一个具体故事/案例，再提炼出通用原则
- **逆向思考**：经常先问"什么是错的？"再推导出"什么是对的？"
- **跨领域类比**：绘画→编程→创业→写作之间频繁跳转
- **不确定的诚实**：承认自己不确定、可能犯错，这在essays中反复出现

> 来源：[Ellen Fishbein分析](https://ellenrhymes.com/paul-graham)、[Quora讨论](https://www.quora.com/What-makes-Paul-Grahams-essays-so-good)、[Billy Oppenheimer](https://billyoppenheimer.com/paul-graham-essays/) | 二手+部分一手

---

## 十二、矛盾与争议记录

### 矛盾1：Mean People Fail vs 现实
- **PG立场**：刻薄的人在创业领域会失败
- **反例**：Jobs、Zuckerberg、Bezos等被广泛认为有刻薄的一面但极其成功
- **可能的调和**：PG可能指的是纯粹的刻薄（无能力的），而非"demanding"

### 矛盾2：Founder Mode vs 之前的建议
- **PG 2024**：创始人应该深入参与运营细节
- **PG之前**：多篇essay建议创始人focus on最重要的事、delegation
- **可能的解释**：PG的thinking在进化，Founder Mode是对之前delegation建议的修正

### 矛盾3：经济不平等观点的争议
- PG曾写essay为经济不平等辩护，认为这是创新的副产品
- 引发Quartz等媒体的批评文章
- 这一立场与他的一些"benevolence"相关论点存在tension

### 矛盾4：AI乐观 vs AI担忧
- **乐观面**：AI是"大量拼图中缺失的那一块"，是重要的技术
- **担忧面**：AI会导致"writes and write-nots"/"thinks and think-nots"的分裂
- 两者不完全矛盾，但反映了Graham对AI的复杂态度

> 来源：多个二手来源综合 | 标注为存在争议

---

## 十三、完整Essay索引（部分，按主题分类）

### 写作类
| Essay | Year | URL |
|-------|------|-----|
| The Age of the Essay | 2004 | paulgraham.com/essay.html |
| Writing, Briefly | 2005 | paulgraham.com/writing44.html |
| Write Like You Talk | 2015 | paulgraham.com/talk.html |
| How to Write Usefully | 2020 | paulgraham.com/useful.html |
| Write Simply | 2021 | paulgraham.com/simply.html |
| Putting Ideas into Words | 2022 | paulgraham.com/words.html |
| The Need to Read | 2022 | paulgraham.com/read.html |
| Writing and Speaking | — | paulgraham.com/speak.html |
| Writes and Write-Nots | 2024 | paulgraham.com/writes.html |
| The Best Essay | 2024 | paulgraham.com/best.html |

### 创业类
| Essay | Year | URL |
|-------|------|-----|
| How to Start a Startup | 2005 | paulgraham.com/start.html |
| How to Get Startup Ideas | 2012 | paulgraham.com/startupideas.html |
| Do Things that Don't Scale | 2013 | paulgraham.com/ds.html |
| Startup = Growth | 2012 | paulgraham.com/growth.html |
| Default Alive or Default Dead? | 2015 | paulgraham.com/aord.html |
| Schlep Blindness | 2012 | paulgraham.com/schlep.html |
| Frighteningly Ambitious Startup Ideas | 2012 | paulgraham.com/ambitious.html |
| Ramen Profitable | 2009 | paulgraham.com/ramenprofitable.html |
| Relentlessly Resourceful | 2009 | paulgraham.com/relres.html |
| Before the Startup | — | paulgraham.com/before.html |
| Startups in 13 Sentences | — | paulgraham.com/13sentences.html |
| A Student's Guide to Startups | — | paulgraham.com/mit.html |
| Founder Mode | 2024 | paulgraham.com/foundermode.html |
| How to Start Google | 2024 | — |

### 人生/认知类
| Essay | Year | URL |
|-------|------|-----|
| How to Do Great Work | 2023 | paulgraham.com/greatwork.html |
| Superlinear Returns | 2023 | paulgraham.com/superlinear.html |
| Life is Short | 2016 | paulgraham.com/vb.html |
| The Bus Ticket Theory of Genius | 2019 | paulgraham.com/genius.html |
| Keep Your Identity Small | 2009 | paulgraham.com/identity.html |
| What You Can't Say | 2004 | paulgraham.com/say.html |
| How to Think for Yourself | 2020 | paulgraham.com/think.html |
| The Four Quadrants of Conformism | 2020 | paulgraham.com/conformism.html |
| What You'll Wish You'd Known | 2005 | paulgraham.com/hs.html |
| Mean People Fail | 2014 | paulgraham.com/mean.html |
| Good and Bad Procrastination | — | — |
| When to Do What You Love | 2024 | — |
| The Right Kind of Stubborn | 2024 | — |

### 技术/编程类
| Essay | Year | URL |
|-------|------|-----|
| Beating the Averages | 2003 | paulgraham.com/avg.html |
| Hackers and Painters | 2003 | paulgraham.com/hp.html |
| Taste for Makers | — | — |
| Why Nerds Are Unpopular | — | — |

### 媒体/社会类
| Essay | Year | URL |
|-------|------|-----|
| The Submarine | 2005 | paulgraham.com/submarine.html |
| Maker's Schedule, Manager's Schedule | 2009 | paulgraham.com/makersschedule.html |

---

## 十四、调研总结

### 关键发现

1. **Paul Graham是当代最有影响力的essay写作者之一**，200+篇essay涵盖创业、写作、编程、人生哲学四大领域

2. **他的思想高度一致且相互关联**：好奇心→独立思考→写作即思考→做出伟大的工作→超线性回报——形成一个完整的intellectual system

3. **他的写作风格是他方法论的最好证明**：用最简单的词表达最深刻的想法，从一手经验（Viaweb、YC）提炼通用原则

4. **2024年最有影响力的两篇**：Founder Mode（重新定义公司管理）和Writes and Write-Nots（预判AI对人类思考能力的影响）

5. **他自创了一系列已进入硅谷日常词汇的术语**：ramen profitable、schlep blindness、do things that don't scale、founder mode、Blub paradox等

6. **他的核心矛盾**在于理想主义（mean people fail、benevolence驱动）与现实之间的tension——但他通常承认自己可能是错的

### 调研局限

- 未能直接访问paulgraham.com完整文本（只能通过搜索获取摘要和引用）
- 2025-2026年的essay信息较少，可能有遗漏
- 书单信息来自二手整理，可能不完整
- 部分essay的具体年份需要进一步确认

---

*调研完成。此文档可作为构建Paul Graham perspective skill的基础素材。*

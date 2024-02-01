import express, { Request, Response } from 'express'
import bodyParser from 'body-parser'
import TelegramBot = require('node-telegram-bot-api')
import dotenv from 'dotenv'
import cors, { CorsOptions } from 'cors'

const whitelist = ['https://metalabs.kg']

const corsOptions: CorsOptions = {
	origin: (
		origin: string | undefined,
		callback: (err: Error | null, allow?: boolean) => void
	) => {
		if (!origin || whitelist.indexOf(origin) !== -1) {
			callback(null, true)
		} else {
			callback(new Error('Not allowed by CORS'))
		}
	},
	methods: 'POST',
	optionsSuccessStatus: 204,
}

dotenv.config()
type Survey = {
	name: string
	phone: string
}
const app = express()
app.use(cors(corsOptions))

app.use(bodyParser.json())

const port = process.env.PORT
const acces_token = process.env.SECRET_KEY
const telegramBotToken = process.env.TGBOT_TOKEN || ''
const bot = new TelegramBot(telegramBotToken, { polling: true })
const survey: Survey[] = []
const usersChatID: number[] = []
let secret_key: string

const apiRouter = express.Router()

app.use('/api', apiRouter)

bot.onText(/\/setToken/, async (msg) => {
	const chatID = msg.chat.id
	await bot.sendMessage(chatID, 'Введите секретный ключ')

	const secretKeyInput = await new Promise<string>((resolve) => {
		bot.once('text', (message) => {
			if (message.text !== undefined) {
				resolve(message.text)
			} else {
				resolve('')
			}
		})
	})

	secret_key = secretKeyInput
	if (acces_token === secret_key) {
		usersChatID.push(chatID)
		bot.sendMessage(chatID, 'Секретный ключ сохранен.')
	} else {
		bot.sendMessage(chatID, 'Вы ввели не правильный секретный ключ.')
	}
})

const getSurvey = (
	secretKey: string,
	usersChatID: number[],
	survey: Survey
) => {
	let isValid = acces_token === secretKey

	if (!isValid) {
		const newUserChatID = [...new Set(usersChatID)]
		newUserChatID.map((chatID: number) => {
			bot.sendMessage(chatID, 'Вы не ввели секретный ключ.')
			return
		})
	}
	if (isValid) {
		const newUserChatID = [...new Set(usersChatID)]
		newUserChatID.map((chatID) => {
			bot.sendMessage(
				chatID,
				`Новая Анкета \n\nИмя: ${survey.name}\nНомер: +${survey.phone}`
			)
		})
	}
}
bot.onText(/\/delToken/, (msg) => {
	const chatID = msg.chat.id
	secret_key = ''
	bot.sendMessage(chatID, 'ваш секретный ключ удален.')
})
apiRouter.post('/telegramBot', (req: Request, res: Response) => {
	res.header('Access-Control-Allow-Origin', 'https://metalabs.kg:8083')
	res.header('Access-Control-Allow-Methods', 'POST')
	res.header('Access-Control-Allow-Headers', 'Content-Type')

	const { phone, name } = req.body

	if (!phone || !name) {
		res
			.status(400)
			.send('Неверный формат запроса. Укажите "phone" и "name" в теле запроса.')
		return
	}

	const newSurvey: Survey = { phone, name }

	survey.push(newSurvey)
	getSurvey(secret_key, usersChatID, newSurvey)
	res.sendStatus(200)
})

app.listen(port, () => {
	console.log(`Сервер запущен на порту ${port}`)
})

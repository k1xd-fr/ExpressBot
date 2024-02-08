import express, { NextFunction, Request, Response } from 'express'
import bodyParser from 'body-parser'
import TelegramBot = require('node-telegram-bot-api')
import dotenv from 'dotenv'
import cors, { CorsOptions } from 'cors'
import morgan from 'morgan'
import fs from 'fs'
import path from 'path'

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

const app = express()
app.use(cors(corsOptions))
const directory = '/root/ExpressBot/logs/access'
const accessLogDirectory = path.join(directory, '/logs/access')
const errorLogDirectory = path.join(directory, '/logs/errors')

fs.mkdirSync(accessLogDirectory, { recursive: true })
fs.mkdirSync(errorLogDirectory, { recursive: true })

const formatDate = () => {
	const now = new Date()
	const day = String(now.getDate()).padStart(2, '0')
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const year = String(now.getFullYear()).slice(2)
	return `${day}-${month}-${year}`
}

app.use(bodyParser.json())

const logFileName = `access_${formatDate()}.log`
const errorLogFileName = `error_${formatDate()}.log`

const accesslogFilePath = path.join(accessLogDirectory, logFileName)
const errorLogFilePath = path.join(errorLogDirectory, errorLogFileName)
const accessLogStream = fs.createWriteStream(accesslogFilePath, { flags: 'a' })
const errorLogStream = fs.createWriteStream(errorLogFilePath, { flags: 'a' })

morgan.token('date', () => {
	const now = new Date()
	const hours = String(now.getHours()).padStart(2, '0')
	const minutes = String(now.getMinutes()).padStart(2, '0')
	const seconds = String(now.getSeconds()).padStart(2, '0')
	return `${hours}:${minutes}:${seconds}`
})

const format = `:remote-addr - :remote-user [:date] ":method :url HTTP/:http-version" :status :res[content-length] "-" ":user-agent" - ${directory}`

app.use(
	morgan(format, {
		stream: accessLogStream,
		skip: (req: Request, res: Response) => res.statusCode >= 400,
	})
)

app.use(
	morgan(format, {
		stream: errorLogStream,
		skip: (req: Request, res: Response) => res.statusCode < 400,
	})
)

app.use((err: any, req: Request, res: Response, next: NextFunction) => {
	res.status(err.status || 500)
	res.send({
		error: {
			status: err.status || 500,
			message: err.message,
		},
	})
})

const port = process.env.PORT
const access_token = process.env.SECRET_KEY
const telegramBotToken = process.env.TGBOT_TOKEN || ''
const bot = new TelegramBot(telegramBotToken, { polling: true })
const usersChatID: number[] = []
let secret_key: string

const apiRouter = express.Router()
app.use('/api', apiRouter)

type Survey = {
	name: string
	phone: string
}

bot.on('polling_error', (error) => {
	console.error('Telegram Bot polling error:', error)
})

bot.onText(/\/setToken/, async (msg) => {
	const chatID = msg.chat.id
	await bot.sendMessage(chatID, 'Введите секретный ключ')

	const secretKeyInput = await new Promise<string>((resolve) => {
		bot.once('text', (message) => {
			resolve(message.text || '')
		})
	})

	secret_key = secretKeyInput
	const similarChatIDIndex = usersChatID.findIndex((id) => id === chatID)
	if (similarChatIDIndex === -1) {
		if (access_token === secret_key) {
			usersChatID.push(chatID)
			bot.sendMessage(chatID, 'Секретный ключ сохранен.')
		} else {
			bot.sendMessage(chatID, 'Вы ввели неправильный секретный ключ.')
		}
	} else {
		bot.sendMessage(chatID, 'Секретный ключ уже сохранен ранее.')
	}
})

const getSurvey = (
	secretKey: string,
	usersChatID: number[],
	survey: Survey
) => {
	const isValid = access_token === secretKey

	if (!isValid) {
		usersChatID.forEach((chatID: number) => {
			bot.sendMessage(chatID, 'Вы не ввели секретный ключ.')
		})
	} else {
		usersChatID.forEach((chatID) => {
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
	bot.sendMessage(chatID, 'Ваш секретный ключ удален.')
})

apiRouter.post('/telegramBot', (req: Request, res: Response) => {
	const { phone, name } = req.body

	if (!phone || !name) {
		res
			.status(400)
			.send('Неверный формат запроса. Укажите "phone" и "name" в теле запроса.')
		return
	}

	const newSurvey: Survey = { phone, name }

	getSurvey(secret_key, usersChatID, newSurvey)
	res.sendStatus(200)
})

app.listen(port, () => {
	console.log(`Сервер запущен на порту ${port}`)
})

import express, { NextFunction, Request, Response } from 'express'
import bodyParser from 'body-parser'
import TelegramBot = require('node-telegram-bot-api')
import dotenv from 'dotenv'
import cors, { CorsOptions } from 'cors'
import morgan from 'morgan'
import fs from 'fs'
import path = require('path')
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
const accessLogDirectory = path.join(__dirname, 'logs/access')
const errorLogDirectory = path.join(__dirname, './logs/errors')

fs.existsSync(accessLogDirectory) || fs.mkdirSync(accessLogDirectory)
fs.existsSync(errorLogDirectory) || fs.mkdirSync(errorLogDirectory)
const formatDate = () => {
	const now = new Date()
	const day = String(now.getDate()).padStart(2, '0')
	const month = String(now.getMonth() + 1).padStart(2, '0')
	const year = String(now.getFullYear()).slice(2)
	return `${day}-${month}-${year}`
}

app.use(bodyParser.json())
const appPath = __dirname
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
const format = `:remote-addr - :remote-user [:date] ":method :url HTTP/:http-version" :status :res[content-length] "-" ":user-agent" - ${appPath}`

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
const acces_token = process.env.SECRET_KEY
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
			if (message.text !== undefined) {
				resolve(message.text)
			} else {
				resolve('')
			}
		})
	})

	secret_key = secretKeyInput
	const similarChatIDIndex = usersChatID.findIndex((id) => id === chatID)
	if (similarChatIDIndex === -1) {
		if (acces_token === secret_key) {
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
	let isValid = acces_token === secretKey

	if (!isValid) {
		usersChatID.map((chatID: number) => {
			bot.sendMessage(chatID, 'Вы не ввели секретный ключ.')
			return
		})
	}
	if (isValid) {
		usersChatID.map((chatID) => {
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

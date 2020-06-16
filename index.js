const mongoose = require('mongoose')
const url = require('url')
const http = require('http')
const request = require('request-promise')
const cheerio = require('cheerio')
const colors = require('colors')
const httpProxyAgent = require('http-proxy-agent')

//--------------------------------------------------------//
//Create Schema
//-------------------------------------------------------//
const { Schema } = mongoose

const workoutSchema = new Schema({
    name: String,
    author: String,
    types: Array,
    name_notes: String,
    duration: String,
    duration_notes: String,
    exercise_notes: String,
    exercises: Array,
    id: String
})

const Workout = mongoose.model('Workout', workoutSchema)

//------------------------------------------------------//
/**
 * Scrape IP addresses and Port numbers
 * 
 * @returns {Promise} URL String
 */

function proxyGenerator() {
    const url = 'https://sslproxies.org/'
    let ipAddresses = []
    let portNumbers = []
    let randomNumbers = Math.floor(Math.random() * 100)

    return new Promise(
        (resolve, reject) => {
            request(url, function (error, response, html) {
                if (!error && response.statusCode == 200) {
                    const $ = cheerio.load(html)
                    //---------Specify here DOM paths to scrape----------//
                    $("td:nth-child(1)").each(function (index, value) {
                        ipAddresses[index] = $(this).text();
                    })
                    $("td:nth-child(2)").each(function (index, value) {
                        portNumbers[index] = $(this).text();
                    })
                    //-----------------End logic-------------------------//
                } else if (error) {
                    reject(error)
                }

                ipAddresses.join(',')
                portNumbers.join(',')
                let proxy = `http://${ipAddresses[randomNumbers]}:${portNumbers[randomNumbers]}`
                resolve(proxy)
            })
        }
    )
}

//---------------------------------------------------//
/**
 * Save scraped workouts to Database
 * 
 * @param {Object} data 
 * 
 * @returns {Promise} 
 */

function addWorkoutToDatabase(data) {
    const { name, author, types, name_notes, duration, duration_notes, exercise_notes, exercises, id } = data
    return (async () => {
        try {
            const idExist = await Workout.findOne({ id })

            if (!idExist) {
                console.log(`ID added: ${id}`.green)
            } else {
                console.error(`ID exists: ${id}`.red)
            }

            await Workout.create({ name, author, types, name_notes, duration, duration_notes, exercise_notes, exercises, id })

        } catch ({ message }) {
            console.log(message)
        }
    })()
}

//---------------------------------------------------//
/**
 * Request data with Nodes HTTP module using GET function
 * 
 * @param {String} query 
 * @param {String} newProxy 
 * 
 * @returns {Promise} JSON object
 */
function requestHandler(query, newProxy) {

    let proxy = newProxy

    let endpoint = `http://woddrive-legacy-service.cfapps.io/getWod?type=${query}`

    let options = url.parse(endpoint)

    let agent = new httpProxyAgent(proxy)
    options.agent = agent

    let chunks = []

    return new Promise((resolve, reject) => {
        try {
            http.get(options, function (res) {
                res.on('data', chunk => chunks.push(chunk))
                res.on('error', reject)
                res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
            })

        } catch ({ message }) {
            console.log(message)
        }
    })


}
//---------------------------------------------------//
//Controller function
//---------------------------------------------------//

(async function () {
    const PORT = 3000
    const DB_URL = 'mongodb://localhost/allWodDb'
    const myQuery = 'hero'
    const numberOfRequests = 200
    let newProxy
    let generateNewProxy = true

    try {
        const isConnected = await mongoose.connect(DB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
        if (isConnected) console.log(`Server up and running on port ${PORT}`)

        do {
            newProxy = await proxyGenerator()
            generateNewProxy = false
            console.log(`using proxy server ${newProxy}`)
        }
        while (generateNewProxy === true)

        for (let i = 0; i < numberOfRequests; i++) {
            const request = await requestHandler(myQuery, newProxy)
            const result = await JSON.parse(request)
            if (result.id === null) generateNewProxy = true
            addWorkoutToDatabase(result)
        }

    } catch ({ message }) {
        console.log(message)
    }
})()

process.on('SIGINT', () => {
    console.log(`shutting down, disconnecting from db...`)

    mongoose.disconnect()

    process.exit(0)
})


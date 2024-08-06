"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.compareSitemaps = void 0;
const axios_1 = __importDefault(require("axios"));
const xml2js = __importStar(require("xml2js"));
const dotenv = __importStar(require("dotenv"));
const Config = __importStar(require("./consts"));
dotenv.config();
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ALLOWED_ORIGINS = Config.ALLOWED_ORIGINS;
const KEYWORDS = Config.KEYWORDS;
const URL_PAIRS = Config.URL_PAIRS;
const isAllowedOrigin = (origin) => {
    return !!origin && ALLOWED_ORIGINS.some(allowedOrigin => origin.startsWith(allowedOrigin));
};
const checkKeywords = (commentBody) => {
    return KEYWORDS.every(keyword => commentBody.toLowerCase().includes(keyword));
};
const extractFirstUrl = (text) => {
    const urlPattern = /https?:\/\/(?:www\.)?\w+(?:[\w\-._~:/?#[\]@!$&'()*+,;%=]*)/;
    const match = text.match(urlPattern);
    return match ? match[0] : null;
};
const findUrl = (text) => {
    for (const key in URL_PAIRS) {
        if (text.includes(URL_PAIRS[key])) {
            return key;
        }
    }
    return null;
};
const fetchSitemap = (url) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const response = yield axios_1.default.get(url);
        const sitemap = yield xml2js.parseStringPromise(response.data);
        console.info(`Sitemap fetched successfully from ${url}`);
        return sitemap;
    }
    catch (error) {
        console.error(`Error fetching sitemap: ${error}`);
        throw error;
    }
});
const getUrls = (sitemap) => {
    const urls = new Set();
    if (sitemap.urlset && sitemap.urlset.url) {
        sitemap.urlset.url.forEach((urlObj) => {
            if (urlObj.loc) {
                urls.add(urlObj.loc[0]);
            }
        });
    }
    return urls;
};
const postGithubComment = (owner, repo, issueNumber, comment) => __awaiter(void 0, void 0, void 0, function* () {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    try {
        yield axios_1.default.post(url, { body: comment }, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
    }
    catch (error) {
        console.error(`Error posting GitHub comment: ${error}`);
    }
});
const compareSitemaps = (request, response) => __awaiter(void 0, void 0, void 0, function* () {
    if (!GITHUB_TOKEN) {
        return response.status(500).json({ error: 'GITHUB_TOKEN is not set' });
    }
    const payload = request.body;
    if (!isAllowedOrigin(payload.issue.url)) {
        return response.status(403).json({ message: 'Forbidden' });
    }
    const event = request.headers['x-github-event'];
    if (event !== 'issue_comment') {
        return response.status(400).json({ error: 'Invalid event' });
    }
    const commentBody = payload.comment.body;
    const repoOwner = payload.repository.owner.login;
    const repoName = payload.repository.name;
    const issueNumber = payload.issue.number;
    if (!checkKeywords(commentBody)) {
        return response.status(400).json({ error: 'No Keywords found' });
    }
    const prevUrl = extractFirstUrl(commentBody);
    const baseUrl = findUrl(prevUrl || '');
    if (!prevUrl || !baseUrl) {
        return response.status(400).json({ error: 'Invalid URL' });
    }
    try {
        const [baseSitemap, prevSitemap] = yield Promise.all([
            fetchSitemap(`${baseUrl}/sitemap.xml`),
            fetchSitemap(`${prevUrl}/sitemap.xml`)
        ]);
        const baseUrls = getUrls(baseSitemap);
        const prevUrls = getUrls(prevSitemap);
        const addedUrls = new Set([...prevUrls].filter(url => !baseUrls.has(url)));
        const removedUrls = new Set([...baseUrls].filter(url => !prevUrls.has(url)));
        const addedUrlsList = addedUrls.size > 0 ? Array.from(addedUrls).map(url => `- ${url}`).join('\n') : 'No URLs are added.';
        const removedUrlsList = removedUrls.size > 0 ? Array.from(removedUrls).map(url => `- ${url}`).join('\n') : 'No URLs are removed.';
        const comment = (`**🔄 Number of Pages in Sitemaps:**\n- ${baseUrl} (${baseUrls.size})\n- ${prevUrl} (${prevUrls.size} + ${addedUrls.size} - ${removedUrls.size} = **${prevUrls.size}**)\n\n` +
            `**📈 Added URLs (${addedUrls.size}):**\n${addedUrlsList}\n\n` +
            `**📉 Removed URLs (${removedUrls.size}):**\n${removedUrlsList}\n\n`);
        yield postGithubComment(repoOwner, repoName, issueNumber, comment);
        return response.status(200).json({ message: 'Sitemaps comparison was processed.' });
    }
    catch (error) {
        if (error instanceof Error) {
            return response.status(500).json({ error: `Error processing sitemaps: ${error.message}` });
        }
        else {
            return response.status(500).json({ error: 'An unknown error occurred' });
        }
    }
});
exports.compareSitemaps = compareSitemaps;

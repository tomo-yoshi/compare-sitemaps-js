import { HttpFunction } from '@google-cloud/functions-framework';
import axios from 'axios';
import * as xml2js from 'xml2js';
import * as dotenv from 'dotenv';
import * as Config from './consts';

dotenv.config();

type SitemapUrl = {
    loc: string[];
};

type Sitemap = {
    urlset: {
        url: SitemapUrl[];
    };
};

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const ALLOWED_ORIGINS = Config.ALLOWED_ORIGINS;
const KEYWORDS = Config.KEYWORDS;
const URL_PAIRS = Config.URL_PAIRS;

const isAllowedOrigin = (origin: string): boolean => {
    return !!origin && ALLOWED_ORIGINS.some(allowedOrigin => origin.startsWith(allowedOrigin));
};

const checkKeywords = (commentBody: string): boolean => {
    return KEYWORDS.every(keyword => commentBody.toLowerCase().includes(keyword));
};

const extractFirstUrl = (text: string): string | null => {
    const urlPattern = /https?:\/\/(?:www\.)?\w+(?:[\w\-._~:/?#[\]@!$&'()*+,;%=]*)/;
    const match = text.match(urlPattern);
    return match ? match[0] : null;
};

const findUrl = (text: string): string | null => {
    for (const key in URL_PAIRS) {
        if (text.includes(URL_PAIRS[key as keyof typeof URL_PAIRS])) {
            return key;
        }
    }
    return null;
};

const fetchSitemap = async (url: string): Promise<Sitemap> => {
    try {
        const response = await axios.get(url);
        const sitemap = await xml2js.parseStringPromise(response.data);
        console.info(`Sitemap fetched successfully from ${url}`);
        return sitemap;
    } catch (error) {
        console.error(`Error fetching sitemap: ${error}`);
        throw error;
    }
};

const getUrls = (sitemap: Sitemap): Set<string> => {
    const urls = new Set<string>();
    if (sitemap.urlset && sitemap.urlset.url) {
        sitemap.urlset.url.forEach((urlObj: any) => {
            if (urlObj.loc) {
                urls.add(urlObj.loc[0]);
            }
        });
    }
    return urls;
};

const postGithubComment = async (owner: string, repo: string, issueNumber: number, comment: string) => {
    const url = `https://api.github.com/repos/${owner}/${repo}/issues/${issueNumber}/comments`;
    try {
        await axios.post(url, { body: comment }, {
            headers: {
                'Authorization': `token ${GITHUB_TOKEN}`,
                'Accept': 'application/vnd.github.v3+json'
            }
        });
    } catch (error) {
        console.error(`Error posting GitHub comment: ${error}`);
    }
};

export const compareSitemaps: HttpFunction = async(request, response) => {
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
        const [baseSitemap, prevSitemap] = await Promise.all([
            fetchSitemap(`${baseUrl}/sitemap.xml`),
            fetchSitemap(`${prevUrl}/sitemap.xml`)
        ]);

        const baseUrls = getUrls(baseSitemap);
        const prevUrls = getUrls(prevSitemap);

        const addedUrls = new Set([...prevUrls].filter(url => !baseUrls.has(url)));
        const removedUrls = new Set([...baseUrls].filter(url => !prevUrls.has(url)));

        const addedUrlsList = addedUrls.size > 0 ? Array.from(addedUrls).map(url => `- ${url}`).join('\n') : 'No URLs are added.';
        const removedUrlsList = removedUrls.size > 0 ? Array.from(removedUrls).map(url => `- ${url}`).join('\n') : 'No URLs are removed.';

        const comment = (
            `**🔄 Number of Pages in Sitemaps:**\n- ${baseUrl} (${baseUrls.size})\n- ${prevUrl} (${prevUrls.size} + ${addedUrls.size} - ${removedUrls.size} = **${prevUrls.size}**)\n\n` +
            `**📈 Added URLs (${addedUrls.size}):**\n${addedUrlsList}\n\n` +
            `**📉 Removed URLs (${removedUrls.size}):**\n${removedUrlsList}\n\n`
        );

        await postGithubComment(repoOwner, repoName, issueNumber, comment);

        return response.status(200).json({ message: 'Sitemaps comparison was processed.' });
    } catch (error: unknown) {
        if (error instanceof Error) {
            return response.status(500).json({ error: `Error processing sitemaps: ${error.message}` });
        } else {
            return response.status(500).json({ error: 'An unknown error occurred' });
        }
    }
};
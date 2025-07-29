import { execSync } from "child_process";
import { Octokit } from "@octokit/core";
import fs from "fs";

let cwd = process.cwd();
let sync_files = ["package.json", "commit.json"];

function publishPackage() {
    let build_dir = get_build_dir();

    let cmd = `npm publish --registry https://npm.pkg.github.com`;

    console.log(cmd);

    runInDir(cmd, build_dir);
}

function runInDir(cmd: string, dir: string) {
    execSync(cmd, {
        cwd: dir,
        encoding: "utf-8",
        stdio: 'inherit'
    })
}

function bumpNpmVersion() {
    console.log("bumpNpmVersion");

    let workflow_path = `${cwd}/ghscripts`;

    let cmd = `npm version patch`;

    console.log(cmd);

    runInDir(cmd, workflow_path);
}

async function getPackageVersion() {
    try {
        const octokit = new Octokit({
            auth: process.env.NODE_AUTH_TOKEN
        })

        let repo = process.env.GITHUB_REPOSITORY as string;
        let repos = repo.split('/');

        let package_name = repos[1];
        let org_name = repos[0];

        let results = await octokit.request('GET /orgs/{org}/packages/{package_type}/{package_name}/versions', {
            package_type: 'npm',
            package_name: package_name,
            org: org_name,
            per_page: 1,
        })

        if (results.status == 200 && results.data.length > 0) {
            return results.data[0].name;
        }

        return ""
    } catch (e) {
        return ""
    }
}

function syncPackageJson() {
    console.log("run packages");
    console.log(cwd);

    let workflow_path = `${cwd}/ghscripts`;

    let build_dir = get_build_dir();

    sync_files.forEach(function (name) {
        let from = `${workflow_path}/${name}`;
        let to = `${build_dir}/${name}`;

        console.log(`copy ${from} to ${to}`);

        fs.copyFileSync(from, to);
    });
}

function writeVersion(version: string) {
    let gh_scripts = `${cwd}/ghscripts`;

    if (!fs.existsSync(gh_scripts)) {
        fs.mkdirSync(gh_scripts);
    }

    let gh_package_path = `${cwd}/ghscripts/package.json`;
    let repo = process.env.GITHUB_REPOSITORY as string;

    let repos = repo.split('/');

    let package_name = repos[1].toLowerCase();
    let org_name = repos[0];

    let package_json = {
        "name": `@${org_name}/${package_name}`,
        "version": "1.0.0",
        "files": [
            "bytecode_modules/*.mv",
            "Buildinfo.yaml",
            "package-metadata.bcs",
            "commit.json"
        ],
        "repository": {
            "type": "git",
            "url": `git+https://github.com/${org_name}/${package_name}.git`
        }
    }

    if (version) {
        package_json.version = version;
    }

    console.log(package_json);
    fs.writeFileSync(gh_package_path, JSON.stringify(package_json, null, 2))
}

function get_build_dir() {
    let cwd = process.cwd();

    let build_path = `${cwd}/build`;
    let build_dirs = fs.readdirSync(build_path);
    let build_dir = build_dirs[0];
    return `${build_path}/${build_dir}`;
}

async function write_last_commit() {
    try {
        const octokit = new Octokit({
            auth: process.env.NODE_AUTH_TOKEN
        })

        let repo = process.env.GITHUB_REPOSITORY as string;
        let repos = repo.split('/');

        let package_name = repos[1];
        let org_name = repos[0];

        let results = await octokit.request('GET /repos/{owner}/{repo}/commits', {
            owner: org_name,
            repo: package_name,
            per_page: 1,
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        })

        if (results.status == 200 && results.data.length > 0) {
            let commit_path = `${cwd}/ghscripts/commit.json`;

            let commit = results.data[0];

            let commit_json = {
                sha: commit.sha,
                commit: commit.commit
            }

            console.log("write_last_commit")
            console.log(commit_json);
            fs.writeFileSync(commit_path, JSON.stringify(commit_json, null, 2))
        }
    } catch (e) {
        console.error(e);
    }

}

async function main() {
    let version = await getPackageVersion();
    writeVersion(version);
    await write_last_commit();
    bumpNpmVersion();
    syncPackageJson();
    publishPackage();
}

main();
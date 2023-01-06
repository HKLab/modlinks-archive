import axios from "axios";
import { existsSync } from "fs";


if (existsSync("SHOULD_CLEAR_CACHE")) {
    setTimeout(() => {
        try {
            axios.get('https://purge.jsdelivr.net/gh/HKLab/modlinks-archive@latest/modlinks.json');
        } catch (e) {
            console.error(e);
        }
        console.log("Clear cache");
    }, 5 * 1000);
}

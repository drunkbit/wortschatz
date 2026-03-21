declare module "dictionary-de" {
    interface Dictionary {
        aff: Uint8Array;
        dic: Uint8Array;
    }
    const dictionary: Dictionary;
    export default dictionary;
}

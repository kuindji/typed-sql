/**
 * Compact netsec schema fixture.
 *
 * Derived from the netsec app db schema.
 * Only tables used by the netsec query tests are included.
 */

export type Json =
    | string
    | number
    | boolean
    | null
    | { [key: string]: Json | undefined }
    | Json[];

export type NetsecSchema = {
    defaultSchema: "public";
    schemas: {
        public: {
            api_key: {
                aws_api_key_id: string | null;
                company_id: string | null;
                created_at: string;
                description: string | null;
                enabled: boolean;
                id: string;
                key: string | null;
                usage_plan_id: string | null;
                user_id: string | null;
            };
            api_key_settings: {
                api_key_id: string;
                settings: Json | null;
            };
            domain: {
                country: string | null;
                creation_date: string | null;
                domain: string;
                expiration_date: string | null;
                manually_created: boolean;
                registrant_email: string | null;
                registrar: string | null;
                registrar_id: number | null;
                registration_ip: unknown;
                source: string;
                status: string | null;
            };
            domain_customer: {
                customer: Json | null;
                domain: string;
            };
            domain_registrant: {
                domain: string;
                registrant: Json | null;
            };
            domain_reseller: {
                domain: string;
                reseller: Json | null;
            };
            entity: {
                domain: string | null;
                id: string;
                name: string;
                old_id: string;
                type: string | null;
            };
            entity_counter: {
                counter: number | null;
                dns_log_counter: number | null;
                dns_log_last_match: string | null;
                entity_id: string;
                last_match: string | null;
                tarpit_log_counter: number | null;
                tarpit_log_last_match: string | null;
            };
            hunt_report_log: {
                creation_date: string | null;
                domain: string;
                domain_type: string | null;
                evidence: string[];
                expiration_date: string | null;
                original_name_servers: string[] | null;
                registrant_email: string | null;
                registrant_name: string | null;
                registrar: string | null;
                registrar_id: number | null;
                status: string | null;
                threat: string | null;
                threat_actor: string | null;
                threat_description: string | null;
                threat_id: string | null;
                threat_type: string | null;
            };
            ip: {
                company_last_updated_at: string | null;
                counter: number | null;
                country: string | null;
                country_last_updated_at: string | null;
                created_at: string | null;
                customer_company_id: string | null;
                customer_company_last_updated_at: string | null;
                dns_and_tarpit: boolean | null;
                dns_log_counter: number;
                entity_id: string | null;
                entity_last_updated_at: string | null;
                ip: unknown;
                last_dns_log_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_counter: number;
            };
            ip_checker_log: {
                client_ip: unknown;
                found: boolean;
                id: string;
                requested_ip: unknown;
                time: string;
            };
            ip_threat_domain: {
                dns_log_counter: number;
                domain: string;
                ip: unknown;
                last_dns_log_match: string | null;
                last_match: string | null;
                last_tarpit_log_match: string | null;
                tarpit_log_counter: number;
            };
            threat: {
                actor: string | null;
                alias: string | null;
                description: string | null;
                id: string;
                malpedia_data: Json | null;
                name: string;
                notes: string | null;
                type: string | null;
                unmapped: boolean;
                yara_available: boolean;
            };
            watchlist: {
                company_id: string | null;
                created_at: string;
                id: string;
                ip_count: number;
                is_company_default: boolean;
                matched_ip_count: number;
                name: string;
                referenced_ip_count: number;
                type: string | null;
                user_id: string | null;
            };
            watchlist_cidr: {
                cidr: unknown;
                created_at: string;
                description: string | null;
                id: string;
                last_checked_at: string | null;
                last_match_at: string | null;
                matched: boolean;
                tags: string[] | null;
                user_id: string | null;
                watchlist_id: string;
            };
            watchlist_company: {
                created_at: string;
                description: string | null;
                entity_id: string | null;
                id: string;
                last_checked_at: string | null;
                last_match_at: string | null;
                matched: boolean;
                user_id: string | null;
                watchlist_id: string;
            };
            watchlist_domain: {
                created_at: string;
                description: string | null;
                domain: string;
                id: string;
                ip: unknown;
                ip_reference: unknown;
                last_checked_at: string | null;
                last_lookup_at: string | null;
                last_match_at: string | null;
                lookup_disabled: boolean;
                lookup_failed: boolean;
                matched: boolean;
                metadata: Json | null;
                user_id: string | null;
                watchlist_id: string;
            };
            watchlist_ip: {
                created_at: string;
                description: string | null;
                id: string;
                ip: unknown;
                ip_reference: unknown;
                last_checked_at: string | null;
                last_match_at: string | null;
                matched: boolean;
                tags: string[] | null;
                user_id: string | null;
                watchlist_id: string;
            };
        };
    };
};
